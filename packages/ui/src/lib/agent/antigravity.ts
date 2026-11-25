import { runtimeFetch } from '../runtime-fetch';
import { captureRuntimeCleanup } from '../runtime-cleanup';
import { ascendingId } from '../opencode/ids';
import { subscribeOpenchamberEvents } from '../openchamberEvents';
import type { AcpConversation, AcpConversationEvent, AcpSend } from '@openchamber/sdk/agent-backends';
import type { AgentBackend } from './backend';
import type { ConversationClient } from './client';
import { syncEventSessionID, type SyncEvent } from './events';
import { classifyStreamPayload } from '../opencode/stream-payload';
import type { AgentRuntime, DirectoryAvailability, ConversationLocation } from './runtime';
import type { FormRequest, PermissionRequest } from './requests';
import { acpSession, acpMessages, acpCatalog } from './antigravity-projection';

const base = '/api/agent/antigravity';
class BackendApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
type BackendRequestBody = AcpSend | { directory: string | null | undefined; title?: string | undefined; id?: string | undefined } | { title: string } | { modelID: string; variant?: string | null | undefined } | { binary: string } | { code: string };
export async function antigravityRequest<T>(route: string, method = 'GET', body?: BackendRequestBody, signal?: AbortSignal): Promise<T> {
  const response = await runtimeFetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json' }, ...body && { body: JSON.stringify(body) }, ...signal && { signal } });
  if (!response.ok) throw new BackendApiError(await response.text(), response.status);
  return JSON.parse(response.status === 204 ? 'null' : await response.text());
}

export function createAntigravityAdapter(): AgentBackend {
  let directory: string | undefined;
  const sessions = new Map<string, AcpConversation>();
  const get = async (id: string, signal?: AbortSignal) => {
    const session = await antigravityRequest<AcpConversation>(`/sessions/${id}`, 'GET', undefined, signal);
    sessions.set(id, session);
    return session;
  };
  const list = async (folder?: string | null) => {
    const result = await antigravityRequest<AcpConversation[]>(`/sessions${folder ? `?directory=${encodeURIComponent(folder)}` : ''}`);
    result.forEach(session => sessions.set(session.id, session));
    return result.map(acpSession);
  };
  const history = async (id: string) => { const session = await get(id); return session.turns.flatMap(turn => acpMessages(session, turn)); };
  const client: ConversationClient = {
    listSessionsPage: async options => ({ sessions: (await list(options?.directory)).filter(session => !options?.search || session.title.includes(options.search)), cursor: {} }),
    listSessions: list,
    async createSession(params, folder) {
      const session = await antigravityRequest<AcpConversation>('/sessions', 'POST', { directory: folder ?? directory, title: params?.title, id: params?.id });
      sessions.set(session.id, session);
      if (params?.model) await client.switchSessionModel(session.id, params.model);
      return acpSession(await get(session.id));
    },
    getSession: async (id, _folder, signal) => acpSession(await get(id, signal)),
    getSessionUnscoped: async id => acpSession(await get(id)),
    captureSessionCleanup: async (_directory, runtimeKey) => {
      const cleanup = await captureRuntimeCleanup(runtimeKey);
      return id => cleanup(async ({ fetch: cleanupFetch, baseUrl }) => {
        const response = await cleanupFetch(`${baseUrl.replace(/\/$/, '')}${base}/sessions/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new BackendApiError(await response.text(), response.status);
      });
    },
    deleteSession: async id => { await antigravityRequest(`/sessions/${id}`, 'DELETE'); sessions.delete(id); return true; },
    renameSession: async (id, title) => { await antigravityRequest(`/sessions/${id}`, 'PATCH', { title }); },
    getSessionMessages: async id => ({ items: (await history(id)).reverse(), cursor: {} }),
    async getSessionMessage(id, messageID) {
      const message = (await history(id)).find(item => item.info.id === messageID);
      if (!message) throw new BackendApiError('Message not found', 404);
      return message;
    },
    getToolContentMessage: (id, messageID) => client.getSessionMessage(id, messageID),
    getSessionInbox: async () => [],
    switchSessionModel: async (id, model) => { await antigravityRequest(`/sessions/${id}/model`, 'POST', { modelID: model.id, variant: model.variant }); },
    switchSessionAgent: async (_id, agent) => { if (agent !== 'antigravity') throw new Error(`Unsupported Antigravity agent: ${agent}`); },
    applySendSelection: async (id, selection) => { if (selection.model) await client.switchSessionModel(id, selection.model); },
    async sendMessage(input) {
      if (input.model) await client.switchSessionModel(input.id, input.model);
      input.beforeSend?.();
      const result = await antigravityRequest<{ id: string }>(`/sessions/${input.id}/send`, 'POST', { id: input.messageId ?? ascendingId('msg'), text: input.text, files: input.files ?? [], context: input.context ?? [] });
      return result.id;
    },
    abortSession: async id => { await antigravityRequest(`/sessions/${id}/abort`, 'POST'); return true; },
    getProvidersForConfig: async (folder, options) => acpCatalog(options?.sessionID ? await get(options.sessionID) : await antigravityRequest<AcpConversation>('/prepare', 'POST', { directory: folder ?? directory ?? await runtime.getFilesystemHome() })),
    listAgents: async () => [{ id: 'antigravity', name: 'antigravity', displayName: 'Antigravity', request: { settings: {}, headers: {}, body: {} }, mode: 'primary', hidden: false, permissions: [] }],
    async replyToPermission(id, requestID, decision, options) {
      const response = await runtimeFetch(`/api/session/${id}/permission/${requestID}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, message: options?.message }) });
      if (!response.ok) throw new BackendApiError(await response.text(), response.status);
      return true;
    },
    async replyToForm(id, formID, answer) {
      const response = await runtimeFetch(`/api/session/${id}/form/${formID}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) });
      if (!response.ok) throw new BackendApiError(await response.text(), response.status);
      return true;
    },
    async cancelForm(id, formID) {
      const response = await runtimeFetch(`/api/session/${id}/form/${formID}`, { method: 'DELETE' });
      if (!response.ok) throw new BackendApiError(await response.text(), response.status);
      return true;
    },
  };
  const runtime: AgentRuntime = {
    checkHealth: async () => (await runtimeFetch('/health')).ok,
    probeHealth: async () => (await runtimeFetch('/health')).ok ? 'healthy' : 'unhealthy',
    getDirectory: () => directory,
    setDirectory: value => { directory = value; },
    getDirectoryAvailability: async folder => (await antigravityRequest<{ availability: DirectoryAvailability }>(`/directory?directory=${encodeURIComponent(folder)}`)).availability,
    classifyDirectoryError: async (_error, folder) => await runtime.getDirectoryAvailability(folder) === 'missing' ? 'missing' : 'failed',
    isNotFoundError: error => error instanceof BackendApiError && error.status === 404,
    reconnectToRuntimeBaseUrl: () => sessions.clear(),
    prepare: () => {}, releaseLocation: async () => {},
    getLocation: folder => antigravityRequest<ConversationLocation>(`/location${folder ?? directory ? `?directory=${encodeURIComponent(folder ?? directory ?? '')}` : ''}`),
    getFilesystemHome: () => antigravityRequest<string>('/home'),
    clearConfigurationCache: () => {},
    getConfiguration: async () => ({ defaultAgent: 'antigravity' }),
    listProjects: async () => [...new Set((await list()).map(session => session.directory))].map(folder => ({ id: folder, worktree: folder, time: { created: 0, updated: 0 }, sandboxes: [] })),
    getVcs: async () => ({}),
    getActiveSessionStatuses: () => antigravityRequest('/statuses'),
    listPendingForms: () => antigravityRequest<FormRequest[]>('/forms'),
    listPendingPermissions: () => antigravityRequest<PermissionRequest[]>('/permissions'),
    listRunningShells: async folder => ({ directory: folder, shells: [] }),
    listRunningImageJobs: async () => [],
    getInitializationError: async message => message,
  };
  const events: AgentBackend['events'] = {
    identity: sessions,
    connect(input) {
      const emit = (folder: string, payload: SyncEvent) => {
        const routed = input.routeDirectory?.(folder, payload) ?? folder;
        if (input.onEvents) input.onEvents(routed, [payload]); else input.onEvent(routed, payload);
      };
      const turnEvents = (session: AcpConversation, turn: AcpConversation['turns'][number]) => {
        for (const message of acpMessages(session, turn)) {
          emit(session.directory, { type: 'message.updated', properties: { info: message.info } });
          for (const part of message.parts) emit(session.directory, { type: 'message.part.updated', properties: { sessionID: session.id, part } });
        }
        emit(session.directory, { type: 'session.status', properties: { sessionID: session.id, status: { type: turn.completed ? 'idle' : 'busy' } } });
        if (turn.completed) emit(session.directory, { type: 'session.idle', properties: { sessionID: session.id } });
      };
      const consume = async (event: AcpConversationEvent) => {
        if (event.type === 'control') {
          const result = classifyStreamPayload(event.payload, event.directory);
          if (result.kind === 'events') for (const item of result.events) {
            if (syncEventSessionID(item.event)?.startsWith('ses_ag_')) emit(event.directory, item.event);
          }
          return;
        }
        if (event.type === 'session') {
          const existing = sessions.has(event.session.id);
          sessions.set(event.session.id, event.session);
          const info = acpSession(event.session);
          emit(event.session.directory, existing ? { type: 'session.patched', properties: { sessionID: info.id, patch: { title: info.title, model: info.model, time: { ...info.time, archived: event.session.archived ?? null }, tokens: info.tokens } } } : { type: 'session.created', properties: { info } });
          return;
        }
        if (event.type === 'deleted') { sessions.delete(event.sessionID); emit(event.directory, { type: 'session.deleted', properties: { sessionID: event.sessionID } }); return; }
        const session = sessions.get(event.sessionID) ?? await get(event.sessionID);
        if (event.type === 'turn') {
          const index = session.turns.findIndex(turn => turn.id === event.turn.id);
          if (index < 0) session.turns.push(event.turn); else session.turns[index] = event.turn;
          turnEvents(session, event.turn);
        } else {
          const turn = session.turns.find(item => item.id === event.turnID);
          if (!turn) throw new Error(`Turn not found: ${event.turnID}`);
          turn.updates.push(event.update);
          turnEvents(session, turn);
        }
      };
      const cleanup = subscribeOpenchamberEvents(event => {
        if (event.type === 'event-stream-ready') { input.onReconnect?.({ replayReset: true, replayed: false }); return; }
        if (event.type === 'agent-backend') { input.onStreamActivity?.(); void consume(event.payload); }
      });
      return { cleanup, reconnect: () => input.onReconnect?.({ replayReset: true, replayed: false }) };
    },
  };
  return { id: 'antigravity', client, runtime, events };
}
