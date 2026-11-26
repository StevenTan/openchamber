import { createConversationEventSource } from './http-events';
import { OpencodeApiError } from '../opencode/api-error';
import { runtimeFetch } from '../runtime-fetch';
import type { AcpConversation } from '@openchamber/sdk/agent-backends';
import type { AgentBackend } from './backend';
import { createConversationHttpClient } from './http-client';
import type { AgentRuntime, DirectoryAvailability, ConversationLocation } from './runtime';
import { acpSession } from './antigravity-projection';

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

export function createAntigravityAdapter(events = createConversationEventSource()): AgentBackend {
  let directory: string | undefined;
  const list = async (folder?: string | null) => {
    const result = await antigravityRequest<AcpConversation[]>(`/sessions${folder ? `?directory=${encodeURIComponent(folder)}` : ''}`);
    return result.map(acpSession);
  };
  const runtime: AgentRuntime = {
    checkHealth: async () => (await runtimeFetch('/health')).ok,
    probeHealth: async () => (await runtimeFetch('/health')).ok ? 'healthy' : 'unhealthy',
    getDirectory: () => directory,
    setDirectory: value => { directory = value; },
    getDirectoryAvailability: async folder => (await antigravityRequest<{ availability: DirectoryAvailability }>(`/directory?directory=${encodeURIComponent(folder)}`)).availability,
    classifyDirectoryError: async (_error, folder) => await runtime.getDirectoryAvailability(folder) === 'missing' ? 'missing' : 'failed',
    isNotFoundError: error => (error instanceof BackendApiError || error instanceof OpencodeApiError) && error.status === 404,
    reconnectToRuntimeBaseUrl: () => {},
    prepare: () => {}, releaseLocation: async () => {},
    getLocation: folder => antigravityRequest<ConversationLocation>(`/location${folder ?? directory ? `?directory=${encodeURIComponent(folder ?? directory ?? '')}` : ''}`),
    getFilesystemHome: () => antigravityRequest<string>('/home'),
    clearConfigurationCache: () => {},
    getConfiguration: async () => ({ defaultAgent: 'antigravity' }),
    listProjects: async () => [...new Set((await list()).map(session => session.directory))].map(folder => ({ id: folder, worktree: folder, time: { created: 0, updated: 0 }, sandboxes: [] })),
    getVcs: async () => ({}),
    getActiveSessionStatuses: () => antigravityRequest('/statuses'),
    listPendingForms: options => client.listPendingForms(options),
    listPendingPermissions: options => client.listPendingPermissions(options),
    listRunningShells: async folder => ({ directory: folder, shells: [] }),
    listRunningImageJobs: async () => [],
    getInitializationError: async message => message,
  };
  const client = createConversationHttpClient('antigravity', runtime);
  return { id: 'antigravity', client, runtime, events };
}
