import { z } from 'zod';
import type { Tool } from '@opencode/schema/tool';
import { FILE_MCP_TOOLS } from './contracts.js';

type Invocation = Pick<Tool.Context, 'sessionID' | 'agent' | 'messageID' | 'id'>;
interface After extends Invocation { tool: string; status: string; result: { output?: unknown; metadata?: Tool.Metadata } }
interface Context {
  tool: {
    transform(run: (tools: { remove(id: string): void; update(id: string, change: (tool: { options?: Tool.Options }) => void): void }) => void): Promise<void>;
    hook(name: 'execute.after', run: (event: After) => Promise<void>): Promise<void>;
  };
  mcp: { transform(run: (servers: { set(name: string, config: { type: 'remote'; url: string; oauth: false; codemode: false; headers: { authorization: string } }): void }) => void): Promise<void> };
}
const resultFiles = z.object({ files: z.array(z.object({
  file: z.string(), patch: z.string(), status: z.enum(['added', 'modified', 'deleted']), additions: z.number(), deletions: z.number(),
})) });
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
    await ctx.tool.hook('execute.after', async event => {
      if (event.status !== 'completed' || !FILE_MCP_TOOLS.includes(event.tool) || event.tool === 'file_view_image') return;
      event.result.metadata = { ...event.result.metadata, files: resultFiles.parse(event.result.output).files };
    });
  },
};
