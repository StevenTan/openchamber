import os from 'node:os';
import fs from 'node:fs/promises';
import { z } from 'zod';
import type { Application, ExpressFactory, ErrorRequestHandler } from '../shared/http-contracts.js';
import type { createAntigravityBackend } from './antigravity.js';
import type { createManagedAgentTools } from '../opencode/managed-agent-tools.js';
import { AntigravityNotInstalledError } from './antigravity-executable.js';

const directoryInput = z.object({ directory: z.string().min(1) });
const sendInput = z.object({ id: z.string().min(1), text: z.string(), files: z.array(z.object({ mime: z.string(), filename: z.string().optional(), url: z.string() })), context: z.array(z.object({ text: z.string() })) });

export function registerAgentBackendRoutes(app: Application, express: Pick<ExpressFactory, 'json'>, backend: ReturnType<typeof createAntigravityBackend>, tools: ReturnType<typeof createManagedAgentTools>) {
  const base = '/api/agent/antigravity';
  app.get(`${base}/settings`, async (_req, res) => res.json(await backend.settings()));
  app.put(`${base}/settings`, express.json({ limit: '1mb' }), async (req, res) => { await backend.configure(z.object({ binary: z.string().min(1) }).parse(req.body)); res.status(204).end(); });
  app.post(`${base}/install`, async (_req, res) => { await backend.install(); res.status(204).end(); });
  app.get(`${base}/authentication`, (_req, res) => res.json(backend.authentication()));
  app.post(`${base}/authenticate`, (_req, res) => res.json(backend.startAuthentication()));
  app.post(`${base}/authentication/code`, express.json({ limit: '1mb' }), (req, res) => res.json(backend.submitAuthentication(z.object({ code: z.string().trim().min(1) }).parse(req.body).code)));
  app.post(`${base}/authentication/cancel`, async (_req, res) => res.json(await backend.cancelAuthentication()));
  app.post(`${base}/logout`, async (_req, res) => res.json(await backend.logout()));
  app.get(`${base}/sessions`, async (req, res) => res.json(await backend.list(z.string().optional().parse(req.query.directory))));
  app.post(`${base}/prepare`, express.json({ limit: '1mb' }), async (req, res) => res.json(await backend.prepare(directoryInput.parse(req.body).directory)));
  app.post(`${base}/sessions`, express.json({ limit: '1mb' }), async (req, res) => { const input = directoryInput.extend({ title: z.string().optional(), id: z.string().startsWith('ses_ag_').optional() }).parse(req.body); res.json(await backend.create(input.directory, input.title, input.id)); });
  app.get<unknown, { id: string }>(`${base}/sessions/:id`, async (req, res) => res.json(await backend.get(req.params.id)));
  app.patch<unknown, { id: string }>(`${base}/sessions/:id`, express.json({ limit: '1mb' }), async (req, res) => { await backend.rename(req.params.id, z.object({ title: z.string() }).parse(req.body).title); res.status(204).end(); });
  app.delete<unknown, { id: string }>(`${base}/sessions/:id`, async (req, res) => { await backend.remove(req.params.id); res.status(204).end(); });
  app.post<unknown, { id: string }>(`${base}/sessions/:id/send`, express.json({ limit: '50mb' }), async (req, res) => res.json({ id: await backend.send(req.params.id, sendInput.parse(req.body)) }));
  app.post<unknown, { id: string }>(`${base}/sessions/:id/model`, express.json({ limit: '1mb' }), async (req, res) => { const input = z.object({ modelID: z.string(), variant: z.string().nullable().optional() }).parse(req.body); await backend.model(req.params.id, input.modelID, input.variant); res.status(204).end(); });
  app.post<unknown, { id: string }>(`${base}/sessions/:id/abort`, async (req, res) => { tools.abortSession(req.params.id); await backend.abort(req.params.id); res.status(204).end(); });
  app.get(`${base}/statuses`, (_req, res) => res.json(backend.statuses()));
  app.get(`${base}/permissions`, (_req, res) => res.json(tools.permissions.list().filter(entry => backend.lookup(entry.request.sessionID)).map(entry => entry.request)));
  app.get(`${base}/forms`, async (_req, res) => res.json((await backend.list()).flatMap(session => session.forms.filter(form => form.state.status === 'pending'))));
  app.get(`${base}/home`, (_req, res) => res.json(os.homedir()));
  app.get(`${base}/location`, async (req, res) => {
    const directory = z.string().optional().parse(req.query.directory) || os.homedir();
    const canonical = await fs.realpath(directory);
    res.json({ directory, project: { id: directory, directory, canonical } });
  });
  app.get(`${base}/directory`, async (req, res) => {
    const { directory } = directoryInput.parse(req.query);
    try { res.json({ availability: (await fs.stat(directory)).isDirectory() ? 'available' : 'missing' }); }
    catch (cause) { if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause; res.json({ availability: 'missing' }); }
  });
  const installationError: ErrorRequestHandler = (cause, _req, res, next) => {
    if (cause instanceof AntigravityNotInstalledError) res.status(409).send(cause.message);
    else next(cause);
  };
  app.use(base, installationError);
}
