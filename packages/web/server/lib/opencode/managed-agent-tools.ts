import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'node:http';
import { createAgentToolRuntime, type AgentToolDependencies } from '../agent-tool/runtime.js';
import { createOpenCodeToolPermissions } from './tool-permissions.js';
import { isString } from '../event-stream/guards.js';
import type { createOpenChamberControlService } from '../openchamber-control/service.js';
import type { SessionClient } from '../openchamber-sessions/opencode-client-contract.js';

type Options = Pick<AgentToolDependencies, 'instanceDir' | 'env' | 'getCommandEnvironment' | 'questionRuntime'> & {
  control: Pick<ReturnType<typeof createOpenChamberControlService>, 'execute' | 'resolveSessionDirectory'>;
  client(): SessionClient;
  server(): Server | null;
  permissionOptions: Parameters<typeof createOpenCodeToolPermissions>[0];
};

export function createManagedAgentTools({ control, client, server, permissionOptions, ...dependencies }: Options) {
  const permissions = createOpenCodeToolPermissions(permissionOptions);
  const runtime = createAgentToolRuntime({
    ...dependencies, crypto, fsPromises, path, permissions,
    executeAction: (...args) => control.execute(...args),
    resolveSessionDirectory: sessionID => control.resolveSessionDirectory(sessionID),
    hasPendingInput: async (sessionID, signal) => (await client().session.inbox.list({ sessionID }, { signal })).length > 0,
    getActivePort: () => {
      const address = server()?.address();
      return address && !isString(address) ? address.port : null;
    },
    getActiveHost: () => {
      const address = server()?.address();
      return address && !isString(address) ? address.address : null;
    },
  });
  const registerQuestionFormRoutes: typeof runtime.registerQuestionFormRoutes = (app, parser) => {
    runtime.registerQuestionFormRoutes(app, parser);
    permissions.registerRoutes(app, parser);
  };
  return { ...runtime, permissions, registerQuestionFormRoutes };
}
