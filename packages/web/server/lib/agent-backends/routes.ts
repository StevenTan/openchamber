import express from 'express';
import { z } from 'zod';
import type { Application, RequestHandler } from '../shared/http-contracts.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { backendSessionId, createSessionInput, promptInput, sessionPatch } from './contracts.js';
import type { AgentBackendRuntime } from './runtime.js';
import { antigravityAvailable } from './antigravity.js';

const json = express.json({ limit: '10mb' });
const errorStatus = z.object({ status: z.number() });

export function registerAgentBackendRoutes(app: Application, runtime: AgentBackendRuntime) {
  const run = (operation: RequestHandler): RequestHandler => async (req, res, next) => {
    try { return await operation(req, res, next); }
    catch (error) {
      const status = error instanceof z.ZodError ? 400 : errorStatus.safeParse(error).data?.status ?? 500;
      return res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
  const requireProvider: RequestHandler = (_req, res, next) => isEnterpriseMode()
    ? res.status(403).json({ code: 'enterprise_mode', error: 'External agents are disabled in enterprise mode.' })
    : next();

  app.get('/api/agent-backends', (_req, res) => res.json({ backends: [
    { id: 'opencode', label: 'OpenCode', available: true },
    { id: 'antigravity', label: 'Antigravity', available: !isEnterpriseMode() && antigravityAvailable() },
  ] }));
  app.get('/api/agent-backends/sessions', run((req, res) => {
    const directory = z.string().optional().parse(req.query.directory);
    return res.json({ sessions: runtime.list(directory), statuses: runtime.statuses(), forms: runtime.forms(directory) });
  }));
  app.post('/api/agent-backends/sessions', requireProvider, json, run(async (req, res) => res.json(await runtime.create(createSessionInput.parse(req.body)))));
  app.get('/api/agent-backends/sessions/:id', run((req, res) => {
    const { messages: _messages, ...session } = runtime.get(backendSessionId.parse(req.params.id));
    return res.json(session);
  }));
  app.get('/api/agent-backends/sessions/:id/messages', run((req, res) => res.json(runtime.get(backendSessionId.parse(req.params.id)).messages)));
  app.patch('/api/agent-backends/sessions/:id', json, run((req, res) => res.json(runtime.patch(backendSessionId.parse(req.params.id), sessionPatch.parse(req.body)))));
  app.delete('/api/agent-backends/sessions/:id', run(async (req, res) => {
    await runtime.remove(backendSessionId.parse(req.params.id));
    return res.json({ deleted: true });
  }));
  app.post('/api/agent-backends/sessions/:id/prompt', requireProvider, json, run(async (req, res) => {
    await runtime.prompt(backendSessionId.parse(req.params.id), promptInput.parse(req.body));
    return res.json({ accepted: true });
  }));
  app.post('/api/agent-backends/sessions/:id/cancel', run(async (req, res) => {
    await runtime.cancel(backendSessionId.parse(req.params.id));
    return res.json({ interrupted: true });
  }));
  app.post('/api/agent-backends/sessions/:id/forms/:formId', json, run((req, res) => {
    const answer = z.object({ decision: z.string().nullable() }).parse(req.body);
    runtime.answer(backendSessionId.parse(req.params.id), z.string().parse(req.params.formId), answer.decision);
    return res.json({ answered: true });
  }));
}
