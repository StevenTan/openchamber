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
import { createQuestionRuntime } from '../agent-question/src/runtime.js';
import { createOpenCodeSessionArchive, type OpenCodeSessionArchive } from '../openchamber-sessions/session-archive.js';
import { configureAntigravityQuotaReader } from '../quota/providers/antigravity/index.js';
import { createTurnDiffRuntime } from '../turn-diffs/runtime.js';
import { createToolActivity } from '../agent-tool/activity.js';
import type { createManagedSessionKnowledgeRuntime } from '../session-knowledge/managed-runtime.js';
import { createBackendRegistry } from './registry.js';
import { createOpenCodeAdapter } from './opencode-adapter.js';
import { createAntigravityAdapter } from './antigravity-adapter.js';
import type { BackendID } from './contracts.js';
import type { OpenCodeSessionMetadata } from '../openchamber-sessions/session-metadata-store.js';
import { AGENT_MCP_SERVERS } from '../agent-tool/catalog.js';

interface Options {
  dataDir: string;
  server(): Server | null;
  tools(): ReturnType<typeof createManagedAgentTools>;
  environment(): NodeJS.ProcessEnv;
  publish(event: { type: 'openchamber:acp'; properties: AcpConversationEvent }): void;
  hub: Pick<GlobalMessageStreamHub, 'injectEvent' | 'subscribeEvent' | 'subscribeStatus'>;
  openCodeClient: Parameters<typeof createOpenCodeSessionArchive>[0]['clientFor'];
  initializeSession(sessionID: string, directory: string): Promise<void>;
  readInstructions(sessionID: string): Promise<Array<{ text: string }>>;
  onUserInput(sessionID: string): void;
  openCodeMetadata: OpenCodeSessionMetadata;
}
export function createAgentBackendHost(options: Options) {
  const identity = createBackendMcpIdentity();
  const owners = new Map<string, BackendID>();
  const turnDiffs = createTurnDiffRuntime(options.dataDir, async (sessionID, reference) => {
    if (backend.lookup(sessionID)) await backend.recordFileDiff(sessionID, reference);
  });
  const backend = createAntigravityBackend({
    ...options,
    turnDiffs,
    reassignSession: identity.reassign,
    registerSession: (sessionID, previousID) => { if (previousID) owners.delete(previousID); owners.set(sessionID, 'antigravity'); },
    publish: event => options.publish({ type: 'openchamber:acp', properties: event }),
    publishForm: (type, data, directory) => options.hub.injectEvent({ directory, spaceId: null, payload: { id: randomUUID(), created: Date.now(), type, data: z.record(z.string(), z.json()).parse(data), location: { directory } } }),
    mcpServers: sessionID => {
      const address = options.server()?.address();
      if (!address || isString(address)) throw new Error('OpenChamber listener is unavailable');
      const headers = [{ name: 'x-openchamber-session', value: identity.token(sessionID) }];
      return Object.values(AGENT_MCP_SERVERS).map(server => ({ type: 'http' as const, name: server.name, url: `http://127.0.0.1:${address.port}${server.path}`, headers }));
    },
  });
  configureAntigravityQuotaReader(() => backend.quota());
  const activity = createToolActivity({
    dataDir: options.dataDir,
    anchor: sessionID => ({ turnID: turnDiffs.current(sessionID)?.turnID, updateIndex: backend.lookup(sessionID)?.turns.at(-1)?.updates.length ?? 0 }),
    changed: async (sessionID, call, turnID) => { if (backend.lookup(sessionID)) await backend.recordToolCall(sessionID, call, turnID); },
  });
  const openCodeArchive = createOpenCodeSessionArchive({ clientFor: options.openCodeClient });
  const registry = createBackendRegistry({ opencode: createOpenCodeAdapter(openCodeArchive, options.openCodeMetadata), antigravity: createAntigravityAdapter(backend) }, owners, backend.ready);
  const applicationDirectory = (sessionID: string) => backend.lookup(sessionID)?.directory;
  const unsubscribe = options.hub.subscribeEvent(event => {
    const parsed = z.object({ type: z.enum(['permission.asked', 'permission.replied', 'form.created', 'form.replied', 'form.cancelled']), data: z.object({ sessionID: z.string().optional(), form: z.object({ sessionID: z.string() }).optional() }) }).safeParse(event.payload);
    const sessionID = parsed.success ? parsed.data.data.sessionID ?? parsed.data.data.form?.sessionID : undefined;
    if (sessionID && backend.lookup(sessionID)) options.publish({ type: 'openchamber:acp', properties: { type: 'control', payload: event.payload, directory: event.directory } });
  });
  const toolOptions = {
    turnDiffs,
    applicationContext: (request: Parameters<typeof resolveOpenCodeMcpContext>[0]) => {
      const context = identity.resolve(request) ?? resolveOpenCodeMcpContext(request);
      return { ...context, record: activity.record(context.sessionID, context.callID) };
    },
    applicationDirectory,
    authorizeMcpRequest: (request: { headers: Record<string, string | string[] | undefined> }) => identity.authorize(request.headers),
  };
  const applicationPolicy = (sessionID: string) => {
    const directory = applicationDirectory(sessionID);
    return directory ? { directory, projectDirectory: directory, rules: [] } : undefined;
  };
  return {
    backend, registry,
    archive: {
      setArchived: async (sessionID: string, archived: boolean) => { await registry.ready; return registry.forSession(sessionID).archive.setArchived(sessionID, archived); },
      readArchivedAt: async (sessionID: string, readOptions?: Parameters<OpenCodeSessionArchive['readArchivedAt']>[1]) => { await registry.ready; return registry.forSession(sessionID).archive.readArchivedAt(sessionID, readOptions); },
    },
    close: async () => { unsubscribe(); await backend.close(); await turnDiffs.close(); },
    toolOptions,
    applicationPolicy,
    createTools(input: ToolOptions): AgentBackendTools {
      const questionRuntime = createQuestionRuntime({
        dataDir: input.questionDataDir, globalEventHub: options.hub,
        isSessionArchived: input.isSessionArchived, isEnabled: input.isEnabled,
        client: async sessionID => { await registry.ready; return { session: registry.forSession(sessionID).question(input.client) }; },
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

export function createManagedAgentBackendHost(options: Omit<Options, 'initializeSession' | 'readInstructions'> & {
  initializePermission(sessionID: string): Promise<void>;
  syncKnowledge: ReturnType<typeof createManagedSessionKnowledgeRuntime>['sync'];
  readInstructions(sessionID: string): Promise<Array<{ text: string }>>;
  sessionStatus(sessionID: string, type: 'idle' | 'busy'): void;
}) {
  const host = createAgentBackendHost({
    ...options,
    publish: event => {
      options.publish(event);
      if (event.properties.type === 'turn') options.sessionStatus(event.properties.sessionID, event.properties.turn.completed ? 'idle' : 'busy');
    },
    initializeSession: async (sessionID, directory) => {
      await options.initializePermission(sessionID);
      await options.syncKnowledge(sessionID, directory);
    },
    readInstructions: async sessionID => {
      await options.syncKnowledge(sessionID, (await host.backend.get(sessionID)).directory);
      return options.readInstructions(sessionID);
    },
  });
  return host;
}

type ToolOptions = Pick<Parameters<typeof createManagedAgentTools>[0], 'instanceDir' | 'control' | 'client' | 'permissionOptions'>
  & Pick<Parameters<typeof createQuestionRuntime>[0], 'isSessionArchived' | 'isEnabled'>
  & { questionDataDir: string };

interface AgentBackendTools {
  questionRuntime: ReturnType<typeof createQuestionRuntime>;
  agentToolRuntime: ReturnType<typeof createManagedAgentTools>;
}
