import { z } from 'zod';
import { projectSession, projectMessages, projectInboxMessage, projectAgent, projectProject, projectVcs, mergeConfigDocuments, configModelIdentifier } from '@openchamber/sdk/conversations/opencode';
import { compact } from '@openchamber/sdk/conversations/identities';
import type { ConversationApi, ConversationContextOptions } from './conversation-contract.js';
import { shellMessageRecords } from '../opencode/message-shells.js';
import type { ConversationRuntime } from './conversation-runtime.js';
import { createOpenCodeInput } from './opencode-input.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';

const cursor = (value: { previous?: string | null | undefined; next?: string | null | undefined }) => ({ ...value.previous != null && { previous: value.previous }, ...value.next != null && { next: value.next } });
const spacesSchema = z.object({ spaces: z.array(z.object({ id: z.string(), name: z.string(), taskTitle: z.object({ title: z.string(), by: z.enum(['user', 'agent']) }).nullish(), state: z.enum(['complete', 'partial', 'stale', 'unknown']), projectDirectory: z.string().nullable(), directory: z.string().nullable() })).optional() });

export function createOpenCodeConversations({ client, directory }: ConversationContextOptions, history: ConversationRuntime): ConversationApi {
  const importHistory = (id: string) => history.importSession(id, async options => {
    const page = await client.message.list({ sessionID: id, limit: options.limit, cursor: options.cursor, order: 'asc' });
    return { items: projectMessages(page.data, id).map(item => ({ info: item.message, parts: item.parts })), cursor: cursor(page.cursor) };
  });
  return {
    create: async input => projectSession(await client.session.create({ id: input.id, title: input.title, agent: input.agent, model: input.model ? { id: input.model.id, providerID: input.model.providerID, ...input.model.variant != null && { variant: input.model.variant } } : undefined, metadata: input.metadata, location: directory ? { directory } : undefined })),
    async list(input) {
      const page = await client.session.list({ directory: input.global ? undefined : directory, limit: input.limit ?? 100, order: input.order, search: input.search, cursor: input.cursor, parentID: input.parentID });
      return { sessions: page.data.map(projectSession), cursor: cursor(page.cursor), ...spacesSchema.parse(page) };
    },
    get: async id => projectSession(await client.session.get({ sessionID: id })),
    remove: async id => { await client.session.remove({ sessionID: id }); history.remove(id); },
    rename: async (id, title) => { await client.session.update({ sessionID: id, title }); },
    async messages(id, options) {
      await importHistory(id);
      const page = history.messages(id, options);
      return options.partShells ? { ...page, items: shellMessageRecords(page.items) } : page;
    },
    async message(id, messageID) {
      await importHistory(id);
      const message = history.message(id, messageID);
      if (!message) throw new OpenChamberControlError('Message not found', 404);
      return message;
    },
    inbox: async id => (await client.session.inbox.list({ sessionID: id })).flatMap(item => {
      const message = projectInboxMessage(item, { sessionID: id, messageID: item.id, created: item.time.created });
      return message ? [message] : [];
    }),
    cancelInbox: async (id, messageID) => { await client.session.inbox.cancel({ sessionID: id, inboxID: messageID }); },
    model: async (id, model) => { await client.session.switchModel({ sessionID: id, model: { id: model.id, providerID: model.providerID, ...model.variant != null && { variant: model.variant } } }); },
    agent: async (id, agent) => { await client.session.switchAgent({ sessionID: id, agent }); },
    ...createOpenCodeInput(client, history, directory),
    interrupt: async id => { await client.session.interrupt({ sessionID: id }); },
    async catalog(_sessionID, includeProviders = true) {
      const [models, fallback, providers] = await Promise.all([client.model.list({ types: ['chat', 'image'] }), client.model.default().catch(() => undefined), includeProviders ? client.provider.list().then(result => result.data) : []]);
      return { providers, models: models.data.map(model => ({ ...model, variants: model.variants ?? [] })), ...fallback?.data && { default: { id: fallback.data.modelID, providerID: fallback.data.providerID } } };
    },
    providers: async () => (await client.provider.list()).data,
    agents: async () => (await client.agent.list()).data.map(projectAgent),
    pendingForms: async () => (await client.form.list()).data,
    pendingPermissions: async () => (await client.permission.request.list()).data,
    replyPermission: async (sessionID, requestID, decision, message) => { await client.permission.reply({ sessionID, requestID, decision, message }); },
    replyForm: async (sessionID, formID, answer) => { await client.session.form.reply({ sessionID, formID, answer }); },
    cancelForm: async (sessionID, formID, message) => { await client.session.form.cancel({ sessionID, formID, message }); },
    location: () => client.location.get(),
    async configuration() {
      const config = mergeConfigDocuments(await client.config.get());
      return compact({ defaultAgent: config.default_agent, defaultModel: configModelIdentifier(config.model) });
    },
    projects: async () => (await client.project.list()).map(projectProject),
    vcs: async () => projectVcs((await client.vcs.get()).data),
    async statuses() {
      const active = z.record(z.string().min(1), z.object({ type: z.literal('running') })).parse(await client.session.active());
      return history.replaceStatuses('opencode', Object.fromEntries(Object.keys(active).map(id => [id, { type: 'busy' as const }])));
    },
    stageRevert: (id, messageID) => client.session.revert.stage({ sessionID: id, messageID }),
    clearRevert: async id => { await client.session.revert.clear({ sessionID: id }); },
    commitRevert: async id => { await client.session.revert.commit({ sessionID: id }); },
    fork: async (id, before) => projectSession(await client.session.fork({ sessionID: id, before })),
  };
}
