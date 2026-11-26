import { z } from 'zod';
import type { Application, ExpressFactory, Request } from '../shared/http-contracts.js';
import type { createToolPermissions } from './permissions.js';

const reply = z.object({ decision: z.enum(['once', 'always', 'reject']), message: z.string().optional() });
interface Options {
  permissions: ReturnType<typeof createToolPermissions>;
  directory(req: Request): Promise<string | undefined>;
  listNative(directory?: string): Promise<{ location: { directory: string }; data: unknown[] }>;
}

export function registerToolPermissionRoutes(app: Application, express: Pick<ExpressFactory, 'json'>, options: Options) {
  app.get('/api/permission/request', async (req, res, next) => {
    const directory = await options.directory(req);
    const own = options.permissions.list(directory);
    if (!own.length) return next();
    const native = await options.listNative(directory);
    return res.json({ ...native, data: [...native.data, ...own.map(entry => entry.request)] });
  });
  app.get<unknown, { sessionID: string; requestID: string }>('/api/session/:sessionID/permission/:requestID', (req, res, next) => {
    if (!req.params.requestID.startsWith('per_oc_')) return next();
    const request = options.permissions.get(req.params.sessionID, req.params.requestID);
    return request ? res.json({ data: request }) : res.status(404).json({ error: 'Permission request not found' });
  });
  app.post<unknown, { sessionID: string; requestID: string }>(['/api/session/:sessionID/permission/:requestID/reply', '/api/conversations/:sessionID/permission/:requestID/reply'], express.json({ limit: '1mb' }), async (req, res, next) => {
    if (!req.params.requestID.startsWith('per_oc_')) return next();
    const input = reply.parse(req.body);
    const handled = await options.permissions.reply(req.params.sessionID, req.params.requestID, input.decision, input.message);
    return handled ? res.status(204).end() : res.status(404).json({ error: 'Permission request not found' });
  });
}
