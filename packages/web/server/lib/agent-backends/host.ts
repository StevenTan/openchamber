import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isString } from '../shared/guards.js';
import type { Server } from 'node:http';
import { createAntigravityBackend } from './antigravity.js';
import { createBackendMcpIdentity } from './mcp-identity.js';
import { resolveOpenCodeMcpContext } from '../opencode/mcp-context.js';
import { createManagedAgentTools } from '../opencode/managed-agent-tools.js';
import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { AcpConversationEvent } from '@openchamber/sdk/agent-backends';
import { createQuestionRuntime, createOpenCodeQuestionSession } from '../agent-question/src/runtime.js';

interface Options {
  dataDir: string;
  server(): Server | null;
  tools(): ReturnType<typeof createManagedAgentTools>;
  environment(): NodeJS.ProcessEnv;
  publish(event: { type: 'openchamber:acp'; properties: AcpConversationEvent }): void;
  hub: Pick<GlobalMessageStreamHub, 'injectEvent' | 'subscribeEvent' | 'subscribeStatus'>;
}
export function createAgentBackendHost(options: Options) {
  const identity = createBackendMcpIdentity();
  const backend = createAntigravityBackend({
    ...options,
    reassignSession: identity.reassign,
    publish: event => options.publish({ type: 'openchamber:acp', properties: event }),
    publishForm: (type, data, directory) => options.hub.injectEvent({ directory, spaceId: null, payload: { id: randomUUID(), created: Date.now(), type, data: z.record(z.string(), z.json()).parse(data), location: { directory } } }),
    mcpServers: sessionID => {
      const address = options.server()?.address();
      if (!address || isString(address)) throw new Error('OpenChamber listener is unavailable');
      const headers = [{ name: 'x-openchamber-session', value: identity.token(sessionID) }];
      return [
        { type: 'http', name: 'openchamber', url: `http://127.0.0.1:${address.port}/api/openchamber/code-mode/mcp`, headers },
        { type: 'http', name: 'openchamber_commands', url: `http://127.0.0.1:${address.port}/api/openchamber/command-tool/mcp`, headers },
        { type: 'http', name: 'file', url: `http://127.0.0.1:${address.port}/api/openchamber/file-tool/mcp`, headers },
      ];
    },
  });
  const applicationDirectory = (sessionID: string) => backend.lookup(sessionID)?.directory;
  const unsubscribe = options.hub.subscribeEvent(event => {
    const parsed = z.object({ type: z.enum(['permission.asked', 'permission.replied', 'form.created', 'form.replied', 'form.cancelled']), data: z.object({ sessionID: z.string().optional(), form: z.object({ sessionID: z.string() }).optional() }) }).safeParse(event.payload);
    const sessionID = parsed.success ? parsed.data.data.sessionID ?? parsed.data.data.form?.sessionID : undefined;
    if (sessionID?.startsWith('ses_ag_')) options.publish({ type: 'openchamber:acp', properties: { type: 'control', payload: event.payload, directory: event.directory } });
  });
  const toolOptions = {
    applicationContext: (request: Parameters<typeof resolveOpenCodeMcpContext>[0]) => identity.resolve(request) ?? resolveOpenCodeMcpContext(request),
    applicationDirectory,
    authorizeMcpRequest: (request: { headers: Record<string, string | string[] | undefined> }) => identity.authorize(request.headers),
  };
  const applicationPolicy = (sessionID: string) => {
    const directory = applicationDirectory(sessionID);
    return directory ? { directory, projectDirectory: directory, rules: [] } : undefined;
  };
  return {
    backend,
    close: async () => { unsubscribe(); await backend.close(); },
    toolOptions,
    applicationPolicy,
    createTools(input: ToolOptions): AgentBackendTools {
      const questionRuntime = createQuestionRuntime({
        dataDir: input.questionDataDir, globalEventHub: options.hub,
        isSessionArchived: input.isSessionArchived, isEnabled: input.isEnabled,
        client: sessionID => ({ session: sessionID?.startsWith('ses_ag_') ? backend.questionSession : createOpenCodeQuestionSession(input.client().session) }),
      });
      const agentToolRuntime = createManagedAgentTools({
        instanceDir: input.instanceDir, control: input.control, client: input.client,
        server: options.server, getCommandEnvironment: options.environment,
        ...toolOptions, questionRuntime,
        permissionOptions: { ...input.permissionOptions, applicationPolicy },
      });
      return { questionRuntime, agentToolRuntime };
    },
  };
}

type ToolOptions = Pick<Parameters<typeof createManagedAgentTools>[0], 'instanceDir' | 'control' | 'client' | 'permissionOptions'>
  & Pick<Parameters<typeof createQuestionRuntime>[0], 'isSessionArchived' | 'isEnabled'>
  & { questionDataDir: string };

interface AgentBackendTools {
  questionRuntime: ReturnType<typeof createQuestionRuntime>;
  agentToolRuntime: ReturnType<typeof createManagedAgentTools>;
}
