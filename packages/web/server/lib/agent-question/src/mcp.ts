import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createMcpRuntime } from '../../agent-tool/mcp.js';
import { questionInput, questionTool } from './plugin.js';
import type { createQuestionRuntime } from './runtime.js';

export function createQuestionMcpRuntime(runtime: Pick<ReturnType<typeof createQuestionRuntime>, 'ask'>) {
  return createMcpRuntime(() => {
    const server = new Server({ name: 'openchamber-questions', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [questionTool] }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      z.literal(questionTool.name).parse(request.params.name);
      const result = await runtime.ask({
        sessionID: z.string().min(1).parse(extra._meta?.['ai.opencode/sessionID']),
        callID: `${extra.requestId}:${randomUUID()}`,
        input: questionInput.parse(request.params.arguments),
      });
      return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
    return server;
  });
}
