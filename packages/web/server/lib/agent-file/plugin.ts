import path from 'node:path';
import { z } from 'zod';
import type { Tool } from '@opencode/schema/tool';
import type { Location } from '@opencode/schema/location';
import { FILE_MCP_TOOLS, fileCall } from './contracts.js';
import { fileCallPaths, prepareFileMutation } from './files.js';
import { fileDiff } from './diff.js';

type Invocation = Pick<Tool.Context, 'sessionID' | 'agent' | 'messageID' | 'id'>;
interface Before extends Invocation { tool: string; input: unknown }
interface After extends Invocation { tool: string; status: string; result: { output?: unknown; metadata?: Tool.Metadata } }
interface Context {
  location: typeof Location.Info.Type;
  permission: { assert(input: InvocationPermission): Promise<void> };
  tool: {
    transform(run: (tools: { remove(id: string): void; update(id: string, change: (tool: { options?: Tool.Options }) => void): void }) => void): Promise<void>;
    hook(name: 'execute.before', run: (event: Before) => Promise<void>): Promise<void>;
    hook(name: 'execute.after', run: (event: After) => Promise<void>): Promise<void>;
  };
  mcp: { transform(run: (servers: { set(name: string, config: { type: 'remote'; url: string; oauth: false; codemode: false; headers: { authorization: string } }): void }) => void): Promise<void> };
}
interface InvocationPermission {
  sessionID: Invocation['sessionID']; agent: Invocation['agent']; action: string; resources: string[]; save: string[];
  source: { type: 'tool'; messageID: Invocation['messageID']; id: Invocation['id'] };
  metadata?: Tool.Metadata;
}
const resultFiles = z.object({ files: z.array(z.object({
  file: z.string(), patch: z.string(), status: z.enum(['added', 'modified', 'deleted']), additions: z.number(), deletions: z.number(),
})) });
const contains = (directory: string, file: string) => {
  const relative = path.relative(directory, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export default {
  id: 'openchamber-file-tools',
  async setup(ctx: Context) {
    const endpoint = new URL('/api/openchamber/file-tool/mcp', process.env.OPENCHAMBER_AGENT_TOOL_URL).href;
    await ctx.tool.transform(tools => {
      for (const name of ['read', 'write', 'edit', 'patch']) tools.remove(name);
      for (const name of FILE_MCP_TOOLS) tools.update(name, tool => {
        tool.options = { ...tool.options, permission: name === 'file_view_image' ? 'read' : 'edit' };
      });
    });
    await ctx.mcp.transform(servers => {
      servers.set('file', { type: 'remote', url: endpoint, oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN } });
    });
    await ctx.tool.hook('execute.before', async event => {
      if (!FILE_MCP_TOOLS.includes(event.tool)) return;
      const call = fileCall.parse({ name: event.tool.slice('file_'.length), input: event.input });
      const paths = fileCallPaths(call, ctx.location.directory);
      const approve = (action: string, resources: string[], metadata?: Tool.Metadata) => ctx.permission.assert({
        sessionID: event.sessionID, agent: event.agent, action, resources, save: action === 'external_directory' ? resources : ['*'],
        source: { type: 'tool', messageID: event.messageID, id: event.id }, ...metadata && { metadata },
      });
      const external = paths.filter(file => !contains(ctx.location.directory, file)
        && (ctx.location.project.directory === path.parse(ctx.location.project.directory).root || !contains(ctx.location.project.directory, file)));
      if (external.length) await approve('external_directory', [...new Set(external.map(file => path.join(path.dirname(file), '*').replaceAll(path.sep, '/')))]);
      const resources = paths.map(file => contains(ctx.location.directory, file) ? path.relative(ctx.location.directory, file).replaceAll(path.sep, '/') : file.replaceAll(path.sep, '/'));
      if (call.name === 'view_image') await approve('read', resources);
      else {
        const files = (await prepareFileMutation(call, ctx.location.directory)).map(fileDiff);
        await approve('edit', resources, { files });
      }
    });
    await ctx.tool.hook('execute.after', async event => {
      if (event.status !== 'completed' || !FILE_MCP_TOOLS.includes(event.tool) || event.tool === 'file_view_image') return;
      event.result.metadata = { ...event.result.metadata, files: resultFiles.parse(event.result.output).files };
    });
  },
};
