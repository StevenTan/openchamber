import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { createAgentToolRuntime, type AgentToolDependencies } from '../agent-tool/runtime.js';
import { createOpenCodeToolPermissions } from './tool-permissions.js';
import { createCodeModeFileActivity } from './code-mode.js';
import { resolveOpenCodeMcpContext } from './mcp-context.js';
import { materializeAgentToolPlugin, materializeCommandPlugin } from './agent-tool-plugin.js';
import { materializeSearchPlugin } from '../agent-search/runtime.js';
import { isString } from '../event-stream/guards.js';
import type { createOpenChamberControlService } from '../openchamber-control/service.js';
import type { SessionClient } from '../openchamber-sessions/opencode-client-contract.js';

type Options = Pick<AgentToolDependencies, 'getCommandEnvironment' | 'questionRuntime'> & {
  instanceDir: string;
  control: Pick<ReturnType<typeof createOpenChamberControlService>, 'execute' | 'resolveSessionDirectory'>;
  client(): SessionClient;
  server(): Server | null;
  permissionOptions: Parameters<typeof createOpenCodeToolPermissions>[0];
};

export function createManagedAgentTools({ control, client, server, permissionOptions, instanceDir, ...dependencies }: Options) {
  const permissions = createOpenCodeToolPermissions(permissionOptions);
  const runtime = createAgentToolRuntime({
    ...dependencies, crypto, permissions,
    resolveMcpContext: resolveOpenCodeMcpContext,
    codeModeFileActivity: createCodeModeFileActivity(permissionOptions),
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
  return {
    ...runtime, permissions, registerQuestionFormRoutes,
    materializePlugin: (options: Parameters<typeof materializeAgentToolPlugin>[1]) => materializeAgentToolPlugin(instanceDir, options),
    materializeCommandPlugin: () => materializeCommandPlugin(instanceDir),
    materializeSearchPlugin: () => materializeSearchPlugin(instanceDir),
    materializeQuestionPlugin: () => dependencies.questionRuntime.materializePlugin(instanceDir),
  };
}
