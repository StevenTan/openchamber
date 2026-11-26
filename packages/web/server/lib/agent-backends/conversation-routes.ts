import { z } from 'zod';
import { STATUS_BY_TAG } from '@openchamber/sdk/conversations/errors';
import type { OpenCodeClient } from '@opencode/client';
import type { Application, ExpressFactory, Request, Response, NextFunction } from '../shared/http-contracts.js';
import type { BackendRegistry } from './registry.js';
import type { ConversationApi } from './conversation-contract.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { AntigravityNotInstalledError } from './antigravity-executable.js';

const metadata = z.record(z.string(), z.json());
const model = z.object({ id: z.string(), providerID: z.string(), variant: z.string().nullable().optional() });
const context = z.object({ id: z.string().optional(), text: z.string(), description: z.string().optional(), metadata: metadata.optional(), delivery: z.enum(['steer', 'queue']).optional() });
const prompt = z.object({ id: z.string(), text: z.string(), files: z.array(z.object({ mime: z.string(), filename: z.string().optional(), url: z.string() })), context: z.array(context), agents: z.array(z.object({ name: z.string(), mention: z.object({ start: z.number(), end: z.number(), text: z.string() }).optional() })), skills: z.array(z.object({ id: z.string() })), metadata: metadata.optional(), delivery: z.enum(['steer', 'queue']).optional() });
const listing = z.object({ global: z.enum(['true', 'false']).optional().transform(value => value === 'true'), limit: z.coerce.number().optional(), cursor: z.string().optional(), order: z.enum(['asc', 'desc']).optional(), search: z.string().optional(), parentID: z.string().nullable().optional() });
const page = z.object({ limit: z.coerce.number().optional(), cursor: z.string().optional(), order: z.enum(['asc', 'desc']).optional(), partShells: z.enum(['true', 'false']).optional().transform(value => value === 'true') });
const catalogQuery = z.object({ backendID: z.enum(['opencode', 'antigravity']).optional(), sessionID: z.string().optional(), includeProviders: z.enum(['true', 'false']).optional() });
const create = z.object({ id: z.string().optional(), title: z.string().optional(), agent: z.string().optional(), model: model.optional(), metadata: metadata.optional(), backendID: z.enum(['opencode', 'antigravity']).optional() });
const sessionRoot = '/api/conversations';
const catalogRoot = '/api/conversation-catalog';

type ConversationRequest = Request<unknown, { id: string; messageID: string }>;
type ConversationResponse = Exclude<Awaited<ReturnType<ConversationApi[keyof ConversationApi]>>, void> | boolean | null | { id: string };

interface Options {
  registry: BackendRegistry;
  client(directory?: string, requestFetch?: typeof fetch): OpenCodeClient;
  abortTools(sessionID: string): void;
  phase: 'native' | 'opencode';
  fetch?: typeof fetch;
}

export function registerConversationRoutes(app: Application, express: Pick<ExpressFactory, 'json' | 'Router'>, options: Options) {
  const router = express.Router();
  const apiFor = (req: ConversationRequest) => {
    const query = catalogQuery.parse(req.query);
    const input = req.method === 'POST' && req.path === sessionRoot ? create.parse(req.body) : query;
    const backendID = input.backendID ?? ('model' in input ? options.registry.forProvider(input.model?.providerID).id : 'opencode');
    const adapter = req.params.id || query.sessionID ? options.registry.forSession(req.params.id ?? query.sessionID)
      : options.registry.forInput({ backendID });
    const directory = z.string().optional().parse(req.query.directory);
    return { adapter, api: adapter.conversations({ directory, client: options.client(directory, options.fetch) }) };
  };
  const handle = (run: (api: ConversationApi, req: ConversationRequest) => Promise<ConversationResponse>) => async (req: ConversationRequest, res: Response, next: NextFunction) => {
    try {
      await options.registry.ready;
      const { adapter, api } = apiFor(req);
      if ((adapter.id === 'opencode') !== (options.phase === 'opencode')) return next();
      res.json(await run(api, req));
    }
    catch (error) {
      if (error instanceof OpenChamberControlError) return res.status(error.statusCode).json({ error: error.message });
      if (error instanceof AntigravityNotInstalledError) return res.status(409).json({ error: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.message });
      const failure = z.object({ _tag: z.string(), message: z.string().optional(), ref: z.string().optional() }).safeParse(error);
      if (failure.success) return res.status(STATUS_BY_TAG.get(failure.data._tag) ?? 500).json({ error: failure.data.message ?? failure.data._tag, tag: failure.data._tag, ref: failure.data.ref });
      const native = z.object({ status: z.number(), message: z.string() }).safeParse(error);
      if (native.success) return res.status(native.data.status).json({ error: native.data.message });
      next(error);
    }
  };
  router.get(sessionRoot, handle(async (api, req) => {
    const input = listing.parse(req.query);
    const result = await api.list(input);
    if (options.phase !== 'opencode' || input.cursor) return result;
    const additional = await Promise.all(options.registry.additional.map(adapter => adapter.conversations({ client: options.client(), directory: z.string().optional().parse(req.query.directory) }).list(input)));
    return { ...result, sessions: [...result.sessions, ...additional.flatMap(entry => entry.sessions)] };
  }));
  router.post(sessionRoot, express.json({ limit: '1mb' }), handle((api, req) => api.create(create.parse(req.body))));
  router.get(`${sessionRoot}/:id`, handle((api, req) => api.get(req.params.id)));
  router.delete(`${sessionRoot}/:id`, handle(async (api, req) => { await api.remove(req.params.id); return true; }));
  router.patch(`${sessionRoot}/:id`, express.json({ limit: '1mb' }), handle(async (api, req) => { await api.rename(req.params.id, z.object({ title: z.string() }).parse(req.body).title); return null; }));
  router.get(`${sessionRoot}/:id/message`, handle((api, req) => api.messages(req.params.id, page.parse(req.query))));
  router.get(`${sessionRoot}/:id/message/:messageID`, handle((api, req) => api.message(req.params.id, req.params.messageID)));
  router.get(`${sessionRoot}/:id/inbox`, handle((api, req) => api.inbox(req.params.id)));
  router.post(`${sessionRoot}/:id/model`, express.json({ limit: '1mb' }), handle(async (api, req) => { await api.model(req.params.id, model.parse(req.body)); return null; }));
  router.post(`${sessionRoot}/:id/agent`, express.json({ limit: '1mb' }), handle(async (api, req) => { await api.agent(req.params.id, z.object({ agent: z.string() }).parse(req.body).agent); return null; }));
  router.post(`${sessionRoot}/:id/context`, express.json({ limit: '50mb' }), handle((api, req) => api.context(req.params.id, context.parse(req.body))));
  router.post(`${sessionRoot}/:id/prompt`, express.json({ limit: '50mb' }), handle(async (api, req) => ({ id: await api.prompt(req.params.id, prompt.parse(req.body)) })));
  router.post(`${sessionRoot}/:id/interrupt`, handle(async (api, req) => { options.abortTools(req.params.id); await api.interrupt(req.params.id); return true; }));
  router.post(`${sessionRoot}/:id/skills`, express.json({ limit: '1mb' }), handle((api, req) => api.skills(z.object({ names: z.array(z.string()) }).parse(req.body).names)));
  router.get(catalogRoot, handle((api, req) => { const input = catalogQuery.parse(req.query); return api.catalog(input.sessionID, input.includeProviders !== 'false'); }));
  router.get(`${catalogRoot}/providers`, handle(api => api.providers()));
  router.get(`${catalogRoot}/agents`, handle(api => api.agents()));
  app.use(router);
}
