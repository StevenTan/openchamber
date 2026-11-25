import { z } from 'zod';
import type { Application, ExpressFactory, Request } from '../shared/http-contracts.js';
import { turnContext, type createTurnDiffRuntime } from './runtime.js';

const session = z.object({ sessionID: z.string().min(1) });
const selection = session.extend({ turnID: z.string().min(1) });
export function registerTurnDiffRoutes(app: Application, express: Pick<ExpressFactory, 'json'>, runtime: ReturnType<typeof createTurnDiffRuntime>, authorize: (request: Pick<Request, 'headers' | 'socket'>) => boolean) {
  const base = '/api/openchamber/turn-diffs';
  app.get(base, async (req, res) => {
    const input = selection.parse(req.query);
    res.json(await runtime.read(input.sessionID, input.turnID));
  });
  app.post<unknown, { action: string }>(`${base}/:action`, express.json({ limit: '50mb' }), async (req, res) => {
    if (!authorize(req)) return res.status(401).json({ error: 'Unauthorized' });
    switch (req.params.action) {
      case 'begin': await runtime.begin(turnContext.parse(req.body)); break;
      case 'finish': await runtime.finish(session.parse(req.body).sessionID); break;
      case 'remove': await runtime.remove(session.parse(req.body).sessionID); break;
      case 'import': await runtime.import(z.object({ entries: z.array(z.object({ key: z.string(), value: z.unknown() })) }).parse(req.body).entries); break;
      case 'read': {
        const input = selection.parse(req.body);
        return res.json(await runtime.read(input.sessionID, input.turnID));
      }
      case 'reference': {
        const input = selection.parse(req.body);
        const record = await runtime.read(input.sessionID, input.turnID);
        return res.json({ turnID: record.turnID, revision: record.revision, files: record.files?.map(({ patch: _patch, ...file }) => file),
          ...record.unavailable && { error: 'Turn diff is unavailable' } });
      }
      default: return res.status(404).json({ error: 'Unknown turn diff action' });
    }
    return res.json({});
  });
}
