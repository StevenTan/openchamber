import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createMcpRuntime } from '../../agent-tool/mcp.js';
import { questionInput, questionTool } from './plugin.js';
import type { createQuestionRuntime } from './runtime.js';
import { recordMcpCall, type ResolveMcpContext } from '../../agent-tool/mcp-context.js';
import type { ToolPermissions } from '../../agent-tool/permissions.js';
import type { Application, ExpressFactory, RequestHandler } from '../../shared/http-contracts.js';

export function createQuestionMcpRuntime(runtime: Pick<ReturnType<typeof createQuestionRuntime>, 'ask'>, resolveContext: ResolveMcpContext, permissions: ToolPermissions) {
  return createMcpRuntime(() => {
    const server = new Server({ name: 'openchamber-questions', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [questionTool] }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const context = resolveContext(extra);
      return recordMcpCall(context, 'request', request.params.name, request.params.arguments ?? {}, async () => {
        z.literal(questionTool.name).parse(request.params.name);
        await (await permissions.session(context.sessionID)).assert({ action: 'question', resources: ['*'], save: ['*'] }, context.signal);
        const result = await runtime.ask({
          sessionID: context.sessionID,
          callID: `${context.callID}:${randomUUID()}`,
          input: questionInput.parse(request.params.arguments),
        });
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      });
    });
    return server;
  });
}

export function registerQuestionFormRoutes(questionRuntime: ReturnType<typeof createQuestionRuntime>, app: Application, express: Pick<ExpressFactory, 'json'>) {
    app.post<Parameters<typeof questionRuntime.resolveBatch>[0]>('/api/openchamber/async-question/resolve', express.json({ limit: '1mb' }), (req, res) => {
      return questionRuntime.resolveBatch(req.body).then(
        () => res.status(204).end(),
        (error: Error & { status?: number }) => res.status(error.status ?? (error.name === 'ZodError' ? 400 : 500)).json({ error: error.message }),
      );
    });
    const resolveQuestion = (cancel: boolean): RequestHandler<{ answer?: unknown }, { sessionID: string; formID: string }> => (req, res, next) => {
      return questionRuntime.resolve(req.params.sessionID, req.params.formID, cancel ? { status: 'cancelled' } : { status: 'answered', answer: req.body?.answer }).then((handled) => {
        if (!handled) return next();
        return res.status(204).end();
      }, (error: Error & { status?: number }) => res.status(error.status ?? (error.name === 'ZodError' ? 400 : 500)).json({ error: error.message }));
    };
    app.post(['/api/session/:sessionID/form/:formID/reply', '/api/conversations/:sessionID/form/:formID/reply'], express.json({ limit: '1mb' }), resolveQuestion(false));
    app.delete(['/api/session/:sessionID/form/:formID', '/api/conversations/:sessionID/form/:formID'], resolveQuestion(true));
}
