import type { BackendRegistry } from '../agent-backends/registry.js';
import type { SessionClientFactory } from '../agent-backends/contracts.js';
import type { createSessionWorkRuntime } from './runtime.js';

export async function readNativeWorkSession(registry: BackendRegistry, sessionID: string, client: SessionClientFactory) {
  const adapter = registry.forSession(sessionID);
  return adapter.id === 'opencode' ? undefined : adapter.sessions(client).get(sessionID);
}

export function createNativeWorkInput(
  userInput: (sessionID: string) => void,
  observeCommandEvent: (event: { type: string; data: { sessionID: string } }) => void,
  onUserMessage: ReturnType<typeof createSessionWorkRuntime>['onUserMessage'],
) {
  return (sessionID: string, directory: string) => {
    userInput(sessionID);
    observeCommandEvent({ type: 'openchamber.session.input', data: { sessionID } });
    onUserMessage({ sessionId: sessionID, directory, createdAt: Date.now() });
  };
}
