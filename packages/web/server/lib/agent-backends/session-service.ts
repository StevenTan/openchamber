import { asNonEmptyString } from '../shared/guards.js';
import { createMessageId } from '../dispatch-results/runtime.js';
import { resolveRequestedModel } from '../openchamber-sessions/requested-model.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import type { createOpenChamberSessionService, SessionPayload, ExistingResult, CreateResult } from '../openchamber-sessions/routes.js';
import type { createAntigravityBackend } from './antigravity.js';
import type { createChatsScope } from '../scheduled-tasks/chats-scope.js';
import type { QueuedItem } from '../message-queue/runtime.js';
import { CHATS_SCOPE_PUBLIC_ID } from '../scheduled-tasks/chats-scope.js';
import { pathToFileURL } from 'node:url';

export function createBackendSessionService(
  openCode: ReturnType<typeof createOpenChamberSessionService>,
  backend: ReturnType<typeof createAntigravityBackend>,
  syncKnowledge: (sessionID: string, directory: string) => Promise<boolean>,
  chatsScope: ReturnType<typeof createChatsScope>,
) {
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
    ...openCode,
    async create(payload: SessionPayload = {}, options: Parameters<typeof openCode.create>[1] = {}): Promise<CreateResult> {
      const model = resolveRequestedModel(payload);
      if (payload.backendID !== 'antigravity' && model?.providerID !== 'antigravity') return openCode.create(payload, options);
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
    send: (sessionID: string | undefined, payload: SessionPayload | null | undefined) => sessionID?.startsWith('ses_ag_') ? send(sessionID, payload ?? {}) : openCode.send(sessionID, payload),
    fork: (sessionID: string | undefined, payload: SessionPayload | null | undefined) => {
      if (sessionID?.startsWith('ses_ag_')) throw new OpenChamberControlError('This backend does not support session forks', 400);
      return openCode.fork(sessionID, payload);
    },
    queueBackend: (sessionID: string) => sessionID.startsWith('ses_ag_') ? {
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
    } : undefined,
  };
}
