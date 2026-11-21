import { createGlobalUiEventBroadcaster } from '../event-stream/index.js';
import { AgentBackendRuntime } from '../agent-backends/runtime.js';
import { registerAgentBackendRoutes } from '../agent-backends/routes.js';

export function createControlEventsRuntime(dataDir, sseClients, writeSseEvent) {
  const broadcastControlSseEvent = createGlobalUiEventBroadcaster({
    sseClients,
    wsClients: new Set(),
    writeSseEvent,
  });
  const runtime = new AgentBackendRuntime(dataDir, (directory, event) => {
    broadcastControlSseEvent({ type: 'openchamber:agent-backend', properties: { directory, event } });
  });
  return {
    broadcastControlSseEvent,
    registerRoutes: app => registerAgentBackendRoutes(app, runtime),
    stop: () => runtime.stop(),
  };
}
