import { z } from 'zod';
import type { Schema } from 'effect';
import type { Tool } from '@opencode/schema/tool';
import { FILE_MCP_TOOLS } from './contracts.js';

type Invocation = Pick<Tool.Context, 'sessionID' | 'agent' | 'messageID' | 'id'>;
interface Context {
  tool: {
    transform(run: (tools: { remove(id: string): void; update(id: string, change: (tool: { options?: Tool.Options; execute(input: Schema.Json, context: Invocation): Promise<{ output?: unknown; metadata?: Tool.Metadata }> }) => void): void }) => void): Promise<void>;
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
      for (const name of ['read', 'write', 'edit', 'patch', 'glob', 'grep']) tools.remove(name);
      for (const name of FILE_MCP_TOOLS) tools.update(name, tool => {
        tool.options = { ...tool.options, permission: name === 'file_view_image' ? 'read' : 'edit' };
        if (name === 'file_view_image') return;
        const execute = tool.execute;
        tool.execute = async (input, context) => {
          const result = await execute(input, context);
          result.metadata = { ...result.metadata, files: resultFiles.parse(result.output).files };
          return result;
        };
      });
    });
    await ctx.mcp.transform(servers => {
      servers.set('file', { type: 'remote', url: endpoint, oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN } });
    });
  },
};
