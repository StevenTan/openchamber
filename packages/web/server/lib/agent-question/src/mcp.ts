import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createMcpRuntime } from '../../agent-tool/mcp.js';
import { questionInput, questionTool } from './plugin.js';
import type { createQuestionRuntime } from './runtime.js';
import type { ResolveMcpContext } from '../../agent-tool/mcp-context.js';

export function createQuestionMcpRuntime(runtime: Pick<ReturnType<typeof createQuestionRuntime>, 'ask'>, resolveContext: ResolveMcpContext) {
  return createMcpRuntime(() => {
    const server = new Server({ name: 'openchamber-questions', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [questionTool] }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      z.literal(questionTool.name).parse(request.params.name);
      const context = resolveContext(extra);
      const result = await runtime.ask({
        sessionID: context.sessionID,
        callID: `${context.callID}:${randomUUID()}`,
        input: questionInput.parse(request.params.arguments),
      });
      return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
    return server;
  });
}
