import { createConversationEventSource } from './http-events';
import { OpencodeApiError } from '../opencode/api-error';
import { runtimeFetch } from '../runtime-fetch';
import type { AgentBackend } from './backend';
import { createConversationHttpClient } from './http-client';
import type { AgentRuntime, DirectoryAvailability } from './runtime';

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
    getLocation: folder => client.getLocation(folder),
    getFilesystemHome: () => antigravityRequest<string>('/home'),
    clearConfigurationCache: () => {},
    getConfiguration: folder => client.getConfiguration(folder),
    listProjects: () => client.listProjects(),
    getVcs: folder => client.getVcs(folder),
    getActiveSessionStatuses: folder => client.getActiveSessionStatuses(folder),
    listPendingForms: options => client.listPendingForms(options),
    listPendingPermissions: options => client.listPendingPermissions(options),
    listRunningShells: async folder => ({ directory: folder, shells: [] }),
    listRunningImageJobs: async () => [],
    getInitializationError: async message => message,
  };
  const client = createConversationHttpClient('antigravity', runtime);
  return { id: 'antigravity', client, runtime, events };
}
