import { asNonEmptyString } from '../shared/guards.js';
import { createMessageId } from '../dispatch-results/runtime.js';
import { resolveRequestedModel } from '../openchamber-sessions/requested-model.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import type { SessionPayload, ExistingResult, CreateResult } from '../openchamber-sessions/routes.js';
import type { createAntigravityBackend } from './antigravity.js';
import { CHATS_SCOPE_PUBLIC_ID } from '../scheduled-tasks/chats-scope.js';
import { pathToFileURL } from 'node:url';
import type { QueuedItem } from '../message-queue/runtime.js';
import { z } from 'zod';
import type { SessionInfo } from '@opencode/client';
import type { AcpConversation } from '@openchamber/sdk/agent-backends';
import type { BackendAdapter, DispatchContext } from './contracts.js';
import { createAntigravityConversations } from './antigravity-conversations.js';

const nativeSessionInfo = (session: AcpConversation): SessionInfo => {
  const model = session.config.find(option => option.category === 'model' && option.type === 'select');
  const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
  return { id: session.id, projectID: session.directory, location: { directory: session.directory }, title: session.title,
    agent: 'antigravity', cost: 0, tokens: session.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ...session.metadata && { metadata: z.record(z.string(), z.json()).parse(session.metadata) },
    ...model?.type === 'select' && { model: { id: model.currentValue, providerID: 'antigravity', ...thought?.type === 'select' && { variant: thought.currentValue } } },
    time: { created: session.created, updated: session.updated, ...session.archived != null && { archived: session.archived } } };
};

function createDispatch(backend: ReturnType<typeof createAntigravityBackend>, { openCode, syncKnowledge, chatsScope }: DispatchContext): ReturnType<BackendAdapter['dispatch']> {
  const selection = async (sessionID: string, payload: SessionPayload) => {
    const model = resolveRequestedModel(payload);
    const variant = asNonEmptyString(payload.variant);
    const session = await backend.get(sessionID);
    const current = session.config.find(option => option.category === 'model' && option.type === 'select');
    const modelID = model?.modelID ?? (current?.type === 'select' ? current.currentValue : '');
    if (model || variant) await backend.model(sessionID, modelID, variant);
    return { providerID: 'antigravity', modelID };
  };
  const send = async (sessionID: string, payload: SessionPayload): Promise<ExistingResult> => {
    if (payload.goal) throw new OpenChamberControlError('This backend does not support goal mode', 400);
    const session = await backend.get(sessionID);
    const prompt = asNonEmptyString(payload.prompt);
    if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
    const model = await selection(sessionID, payload);
    const baselineAssistantMessageId = session.turns.at(-1)?.assistantID;
    if (session.archived) await backend.archive.setArchived(sessionID, false);
    await syncKnowledge(sessionID, session.directory);
    await backend.send(sessionID, { id: asNonEmptyString(payload.messageId) ?? createMessageId(Date.now()), text: prompt, files: [], context: [] }, payload.promptedBySessionId ? 'synthetic' : 'user');
    return { action: 'send', sessionId: sessionID, directory: session.directory, model, agent: 'antigravity', promptDispatched: true, dispatchedAsCommand: false,
      ...baselineAssistantMessageId && { baselineAssistantMessageId } };
  };
  return {
    async create(payload: SessionPayload = {}, options: Parameters<typeof openCode.create>[1] = {}): Promise<CreateResult> {
      if (payload.goal) throw new OpenChamberControlError('This backend does not support goal mode', 400);
      if (payload.worktree || payload.pullRequest || options.operatorParentId) throw new OpenChamberControlError('This backend does not support worktree creation or child sessions', 400);
      const chats = (payload.projectId ?? payload.projectID) === CHATS_SCOPE_PUBLIC_ID;
      if (chats && asNonEmptyString(payload.directory)) throw new OpenChamberControlError('Provide only one of projectId or directory', 400);
      const directory = chats ? await chatsScope.createChatDirectory() : await openCode.resolveDirectory(payload);
      const title = asNonEmptyString(payload.title);
      let session;
      try { session = await backend.create(directory, title ?? undefined); }
      catch (error) { if (chats) await chatsScope.discardChatDirectory(directory); throw error; }
      const selected = await selection(session.id, payload);
      if (asNonEmptyString(payload.prompt)) return send(session.id, payload);
      return { sessionId: session.id, directory, model: selected, agent: 'antigravity', promptDispatched: false, dispatchedAsCommand: false, ...title && { title } };
    },
    send: (sessionID, payload) => send(asNonEmptyString(sessionID) ?? '', payload ?? {}),
    fork: async () => { throw new OpenChamberControlError('This backend does not support session forks', 400); },
    queueBackend: sessionID => ({
      isIdle: async () => { await backend.get(sessionID); return !backend.statuses()[sessionID]; },
      async send(directory: string, item: QueuedItem) {
        if (item.goal) throw new OpenChamberControlError('This backend does not support goal mode', 400);
        await selection(sessionID, item.sendConfig);
        await syncKnowledge(sessionID, directory);
        await backend.send(sessionID, {
          id: item.id,
          text: item.text,
          files: item.attachments.map(file => { const path = file.agentPath ?? file.serverPath; return { mime: file.mimeType, filename: file.filename, url: path ? pathToFileURL(path).href : file.dataUrl }; }),
          context: item.context.flatMap(part => part.kind === 'context' && part.instructions ? [{ text: part.instructions }, { text: part.text }] : [{ text: part.text }]),
        }, 'synthetic');
      },
    }),
  };
}

export function createAntigravityAdapter(backend: ReturnType<typeof createAntigravityBackend>): BackendAdapter {
  return {
    id: 'antigravity', providers: ['antigravity'], archive: backend.archive,
    metadata: {
      read: async sessionID => (await backend.get(sessionID)).metadata ?? {},
      write: (sessionID, metadata) => backend.metadata(sessionID, metadata),
    },
    sessions: () => ({
      get: async sessionID => nativeSessionInfo(await backend.get(sessionID)),
      list: async input => ({ data: input.cursor ? [] : (await backend.list(input.directory)).map(nativeSessionInfo), cursor: { next: null } }),
      active: async () => backend.statuses(),
      async messages(sessionID, input) {
        const page = await backend.messages(sessionID, { ...input, order: input.order ?? 'asc' });
        return { data: page.items.map(({ info, parts }) => ({ id: info.id, type: info.role,
          text: parts.flatMap(part => part.type === 'text' ? [part.text] : []).join(''), time: info.time,
          ...info.role === 'assistant' && { model: { providerID: info.providerID, id: info.modelID } },
        })), cursor: { next: page.cursor.next ?? null } };
      },
      rename: (sessionID, title) => backend.rename(sessionID, title),
      async interrupt(sessionID) {
        const interrupted = Boolean(backend.statuses()[sessionID]);
        await backend.abort(sessionID);
        return { interrupted };
      },
      hasPendingInput: async () => false,
      forms: async () => ({
        ...backend.questionSession.form,
        list: async ({ sessionID }) => (await backend.get(sessionID)).forms.filter(form => form.state.status === 'pending').map(form => ({ id: z.string().parse(form.id), state: form.state })),
      }),
    }),
    dispatch: context => createDispatch(backend, context),
    modelCatalog: () => async directory => {
      const session = await backend.prepare(directory);
      const model = session.config.find(option => option.category === 'model' && option.type === 'select');
      return model?.type === 'select' ? model.options.flatMap(option => 'group' in option ? option.options : [option]).map(option => ({ providerID: 'antigravity', id: option.value })) : [];
    },
    question: () => backend.questionSession,
    conversations: options => createAntigravityConversations(backend, options.directory),
    async models(_client, directory, sessionID) {
      const session = await (sessionID ? backend.get(sessionID) : backend.prepare(directory));
      const model = session.config.find(option => option.category === 'model' && option.type === 'select');
      const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
      const variants = thought?.type === 'select' ? thought.options.flatMap(option => 'group' in option ? option.options : [option]).map(option => ({ id: option.value })) : [];
      const models = model?.type === 'select' ? model.options.flatMap(option => 'group' in option ? option.options : [option]).map(option => ({ id: option.value, providerID: 'antigravity', name: option.name, variants })) : [];
      return { models, providers: new Map([['antigravity', 'Antigravity']]) };
    },
  };
}
