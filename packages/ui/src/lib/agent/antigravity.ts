import { OpencodeApiError } from '../opencode/api-error';
import { runtimeFetch } from '../runtime-fetch';
import { subscribeOpenchamberEvents } from '../openchamberEvents';
import type { AcpConversation, AcpConversationEvent } from '@openchamber/sdk/agent-backends';
import type { AgentBackend } from './backend';
import { createConversationHttpClient } from './http-client';
import { syncEventSessionID, type SyncEvent } from './events';
import { classifyStreamPayload } from '../opencode/stream-payload';
import type { AgentRuntime, DirectoryAvailability, ConversationLocation } from './runtime';
import type { FormRequest, PermissionRequest } from './requests';
import { acpSession, acpMessages } from './antigravity-projection';

const base = '/api/agent/antigravity';
class BackendApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
type BackendRequestBody = { binary: string } | { code: string };
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
  const pending: Parameters<typeof createConversationHttpClient>[2] = {
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
    isNotFoundError: error => (error instanceof BackendApiError || error instanceof OpencodeApiError) && error.status === 404,
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
  return { id: 'antigravity', client: createConversationHttpClient('antigravity', runtime, pending), runtime, events };
}
