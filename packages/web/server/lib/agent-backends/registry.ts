import { resolveRequestedModel } from '../openchamber-sessions/requested-model.js';
import type { SessionPayload } from '../openchamber-sessions/payload.js';
import type { BackendAdapter, BackendID } from './contracts.js';

export function createBackendRegistry(adapters: Record<BackendID, BackendAdapter>, owners: Map<string, BackendID>, ready: Promise<void>) {
  const additional = Object.values(adapters).filter(adapter => adapter !== adapters.opencode);
  const forSession = (sessionID?: string) => adapters[sessionID ? owners.get(sessionID) ?? 'opencode' : 'opencode'];
  const forProvider = (providerID?: string) => Object.values(adapters).find(adapter => adapter.providers.includes(providerID ?? '')) ?? adapters.opencode;
  return {
    ready,
    additional,
    forSession,
    forProvider,
    forInput: (input: SessionPayload) => additional.find(adapter => adapter.id === input.backendID) ?? forProvider(resolveRequestedModel(input)?.providerID),
  };
}
export type BackendRegistry = ReturnType<typeof createBackendRegistry>;
