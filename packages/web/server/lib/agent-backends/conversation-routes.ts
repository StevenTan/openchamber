import { z } from 'zod';
import { STATUS_BY_TAG } from '@openchamber/sdk/conversations/errors';
import type { OpenCodeClient } from '@opencode/client';
import type { Application, ExpressFactory, Request, Response, NextFunction } from '../shared/http-contracts.js';
import type { BackendRegistry } from './registry.js';
import type { ConversationApi } from './conversation-contract.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { AntigravityNotInstalledError } from './antigravity-executable.js';
import type { createToolPermissions } from '../agent-tool/permissions.js';
import { listConversationSkills, resolveConversationSkills, readConversationSkills } from './skills.js';
import type { ConversationSkills, ConversationContext } from '@openchamber/sdk/conversations/http';
import { conversationContext, conversationPrompt } from './prompt-schema.js';
import type { ConversationInput } from './conversation-input.js';

const metadata = z.record(z.string(), z.json());
const model = z.object({ id: z.string(), providerID: z.string(), variant: z.string().nullable().optional() });
const listing = z.object({ global: z.enum(['true', 'false']).optional().transform(value => value === 'true'), limit: z.coerce.number().optional(), cursor: z.string().optional(), order: z.enum(['asc', 'desc']).optional(), search: z.string().optional(), parentID: z.string().nullable().optional() });
const page = z.object({ limit: z.coerce.number().optional(), cursor: z.string().optional(), order: z.enum(['asc', 'desc']).optional(), partShells: z.enum(['true', 'false']).optional().transform(value => value === 'true') });
const catalogQuery = z.object({ backendID: z.enum(['opencode', 'antigravity']).optional(), sessionID: z.string().optional(), includeProviders: z.enum(['true', 'false']).optional() });
const create = z.object({ id: z.string().optional(), title: z.string().optional(), agent: z.string().optional(), model: model.optional(), metadata: metadata.optional(), backendID: z.enum(['opencode', 'antigravity']).optional() });
const sessionRoot = '/api/conversations';
const catalogRoot = '/api/conversation-catalog';
const requestRoot = '/api/conversation-requests';
const permissionReply = z.object({ decision: z.enum(['once', 'always', 'reject']), message: z.string().optional() });
const formReply = z.object({ answer: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])) });
const formCancel = z.object({ message: z.string().optional() });
const runtimeRoot = '/api/conversation-runtime';

type ConversationRequest = Request<unknown, { id: string; messageID: string; requestID: string; formID: string }>;
type ConversationResponse = Exclude<Awaited<ReturnType<ConversationApi[keyof ConversationApi]>>, void> | boolean | null | { id: string } | ConversationSkills | ConversationContext[];

interface Options {
  registry: BackendRegistry;
  client(directory?: string, requestFetch?: typeof fetch): OpenCodeClient;
  abortTools(sessionID: string): void;
  phase: 'native' | 'opencode';
  fetch?: typeof fetch;
  permissions: Pick<ReturnType<typeof createToolPermissions>, 'list'>;
  skillDirectories?(): readonly string[];
  input: ConversationInput;
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
    return options.registry.list({ ...input, directory: z.string().optional().parse(req.query.directory), backendID: catalogQuery.parse(req.query).backendID });
  }));
  router.post(sessionRoot, express.json({ limit: '1mb' }), handle((api, req) => api.create(create.parse(req.body))));
  router.get(`${sessionRoot}/:id`, handle((api, req) => api.get(req.params.id)));
  router.delete(`${sessionRoot}/:id`, handle(async (api, req) => { await api.remove(req.params.id); return true; }));
  router.patch(`${sessionRoot}/:id`, express.json({ limit: '1mb' }), handle(async (api, req) => { await api.rename(req.params.id, z.object({ title: z.string() }).parse(req.body).title); return null; }));
  router.get(`${sessionRoot}/:id/message`, handle((api, req) => api.messages(req.params.id, page.parse(req.query))));
  router.get(`${sessionRoot}/:id/message/:messageID`, handle((api, req) => api.message(req.params.id, req.params.messageID)));
  router.get(`${sessionRoot}/:id/inbox`, handle((api, req) => options.input.inbox(api, req.params.id)));
  router.delete(`${sessionRoot}/:id/inbox/:messageID`, handle(async (api, req) => { await options.input.cancel(api, req.params.id, req.params.messageID); return true; }));
  router.post(`${sessionRoot}/:id/model`, express.json({ limit: '1mb' }), handle(async (api, req) => { await api.model(req.params.id, model.parse(req.body)); return null; }));
  router.post(`${sessionRoot}/:id/agent`, express.json({ limit: '1mb' }), handle(async (api, req) => { await api.agent(req.params.id, z.object({ agent: z.string() }).parse(req.body).agent); return null; }));
  router.post(`${sessionRoot}/:id/context`, express.json({ limit: '50mb' }), handle(async (_api, req) => [conversationContext.parse(req.body)]));
  router.post(`${sessionRoot}/:id/prompt`, express.json({ limit: '50mb' }), handle(async (api, req) => {
    const input = conversationPrompt.parse(req.body);
    if (input.skills.length) {
      const session = await api.get(req.params.id);
      const skills = await listConversationSkills(session.directory, options.skillDirectories?.());
      input.context.push(...await readConversationSkills(skills, input.skills));
    }
    return { id: await options.input.prompt(api, req.params.id, { ...input, skills: [] }) };
  }));
  router.post(`${sessionRoot}/:id/interrupt`, handle(async (api, req) => { options.abortTools(req.params.id); await api.interrupt(req.params.id); return true; }));
  router.post(`${sessionRoot}/:id/revert/stage`, express.json({ limit: '1mb' }), handle((api, req) => api.stageRevert(req.params.id, z.object({ messageID: z.string() }).parse(req.body).messageID)));
  router.post(`${sessionRoot}/:id/revert/clear`, handle(async (api, req) => { await api.clearRevert(req.params.id); return null; }));
  router.post(`${sessionRoot}/:id/revert/commit`, handle(async (api, req) => { await api.commitRevert(req.params.id); return null; }));
  router.post(`${sessionRoot}/:id/fork`, express.json({ limit: '1mb' }), handle((api, req) => api.fork(req.params.id, z.object({ before: z.string().optional() }).parse(req.body).before)));
  router.post(`${sessionRoot}/:id/skills`, express.json({ limit: '1mb' }), handle(async (api, req) => {
    const { names } = z.object({ names: z.array(z.string()) }).parse(req.body);
    if (!names.length) return { attached: [], unresolved: [] };
    const session = await api.get(req.params.id);
    return resolveConversationSkills(await listConversationSkills(session.directory, options.skillDirectories?.()), names);
  }));
  router.get(catalogRoot, handle((api, req) => { const input = catalogQuery.parse(req.query); return api.catalog(input.sessionID, input.includeProviders !== 'false'); }));
  router.get(`${catalogRoot}/providers`, handle(api => api.providers()));
  router.get(`${catalogRoot}/agents`, handle(api => api.agents()));
  router.get(`${requestRoot}/forms`, handle(async (api, req) => {
    const directory = z.string().optional().parse(req.query.directory);
    const additional = await Promise.all(options.registry.additional.map(adapter => adapter.conversations({ client: options.client(), directory }).pendingForms()));
    return [...await api.pendingForms(), ...additional.flat()];
  }));
  router.get(`${requestRoot}/permissions`, handle(async (api, req) => [
    ...await api.pendingPermissions(),
    ...options.permissions.list(z.string().optional().parse(req.query.directory)).map(({ request: { metadata, ...request } }) => ({ ...request, ...metadata && { metadata: z.record(z.string(), z.json()).parse(metadata) } })),
  ]));
  router.post(`${sessionRoot}/:id/permission/:requestID/reply`, express.json({ limit: '1mb' }), handle(async (api, req) => {
    const input = permissionReply.parse(req.body);
    await api.replyPermission(req.params.id, req.params.requestID, input.decision, input.message);
    return true;
  }));
  router.post(`${sessionRoot}/:id/form/:formID/reply`, express.json({ limit: '1mb' }), handle(async (api, req) => {
    await api.replyForm(req.params.id, req.params.formID, formReply.parse(req.body).answer);
    return true;
  }));
  router.delete(`${sessionRoot}/:id/form/:formID`, express.json({ limit: '1mb' }), handle(async (api, req) => {
    await api.cancelForm(req.params.id, req.params.formID, formCancel.parse(req.body ?? {}).message);
    return true;
  }));
  router.get(`${runtimeRoot}/location`, handle(api => api.location()));
  router.get(`${runtimeRoot}/configuration`, handle(api => api.configuration()));
  router.get(`${runtimeRoot}/projects`, handle(api => api.projects()));
  router.get(`${runtimeRoot}/vcs`, handle(api => api.vcs()));
  router.get(`${runtimeRoot}/statuses`, handle(async (api, req) => {
    const directory = z.string().optional().parse(req.query.directory);
    const additional = await Promise.all(options.registry.additional.map(adapter => adapter.conversations({ client: options.client(), directory }).statuses()));
    return Object.assign(await api.statuses(), ...additional);
  }));
  app.use(router);
}
