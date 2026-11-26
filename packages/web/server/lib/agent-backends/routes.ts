import os from 'node:os';
import fs from 'node:fs/promises';
import { z } from 'zod';
import type { Application, ExpressFactory, ErrorRequestHandler } from '../shared/http-contracts.js';
import type { createAntigravityBackend } from './antigravity.js';
import { AntigravityNotInstalledError } from './antigravity-executable.js';

const directoryInput = z.object({ directory: z.string().min(1) });

export function registerAgentBackendRoutes(app: Application, express: Pick<ExpressFactory, 'json'>, backend: ReturnType<typeof createAntigravityBackend>) {
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
  app.get<unknown, { id: string }>(`${base}/sessions/:id`, async (req, res) => res.json(await backend.get(req.params.id)));
  app.get(`${base}/home`, (_req, res) => res.json(os.homedir()));
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
