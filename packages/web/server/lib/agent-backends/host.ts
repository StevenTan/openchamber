import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isString } from '../shared/guards.js';
import type { Server } from 'node:http';
import { createAntigravityBackend } from './antigravity.js';
import { createBackendMcpIdentity } from './mcp-identity.js';
import { resolveOpenCodeMcpContext } from '../opencode/mcp-context.js';
import { createManagedAgentTools } from '../opencode/managed-agent-tools.js';
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
import express from 'express';
import type { OpenCodeClient } from '@opencode/client';
import type { Application } from '../shared/http-contracts.js';
import { registerAgentBackendRoutes } from './routes.js';
import { registerConversationRoutes } from './conversation-routes.js';
import { createConversationStream, type ConversationEventHub } from './conversation-stream.js';
import { antigravityEvents } from './antigravity-events.js';
import type { ForwardEventPayload } from '../event-stream/contracts.js';
import { listConversationSkills, conversationSkillGuidance, registerSkillCatalogRoute } from './skills.js';

interface Options {
  dataDir: string;
  server(): Server | null;
  tools(): ReturnType<typeof createManagedAgentTools>;
  environment(): NodeJS.ProcessEnv;
  publish(event: { type: 'openchamber:acp'; properties: AcpConversationEvent }): void;
  hub: ConversationEventHub;
  openCodeClient(directory?: string, requestFetch?: typeof fetch): OpenCodeClient;
  initializeSession(sessionID: string, directory: string): Promise<void>;
  readInstructions(sessionID: string): Promise<Array<{ text: string }>>;
  onUserInput(sessionID: string, directory: string): void;
  openCodeMetadata: OpenCodeSessionMetadata;
  processForwardedEventPayload?: ForwardEventPayload;
  skillDirectories?(): readonly string[];
}
export function createAgentBackendHost(options: Options) {
  const stream = createConversationStream(options.hub, options.processForwardedEventPayload);
  const identity = createBackendMcpIdentity();
  const owners = new Map<string, BackendID>();
  const turnDiffs = createTurnDiffRuntime(options.dataDir, async (sessionID, reference) => {
    if (backend.lookup(sessionID)) await backend.recordFileDiff(sessionID, reference);
  });
  const backend = createAntigravityBackend({
    ...options,
    readInstructions: async sessionID => {
      const session = await backend.get(sessionID);
      const skills = await listConversationSkills(session.directory, options.skillDirectories?.());
      return [...await options.readInstructions(sessionID), { text: conversationSkillGuidance(skills) }];
    },
    turnDiffs,
    reassignSession: identity.reassign,
    registerSession: (sessionID, previousID) => { if (previousID) owners.delete(previousID); owners.set(sessionID, 'antigravity'); },
    publish: event => {
      options.publish({ type: 'openchamber:acp', properties: event });
      if (event.type === 'control') return;
      if (event.type === 'deleted') stream.publish([{ type: 'session.deleted', properties: { sessionID: event.sessionID } }], event.directory);
      else stream.publish(antigravityEvents(event), event.session.directory);
    },
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
  const conversations = { registry, client: options.openCodeClient, abortTools: (id: string) => options.tools().abortSession(id), permissions: { list: (directory?: string) => options.tools().permissions.list(directory) }, skillDirectories: () => options.skillDirectories?.() ?? [] };
  return {
    backend, registry, stream,
    registerRoutes(app: Application) {
      registerSkillCatalogRoute(app, express, { authorize: req => options.tools().authorizeRequest(req), directories: () => options.skillDirectories?.() ?? [] });
      stream.registerRoutes(app);
      registerAgentBackendRoutes(app, express, backend);
      registerConversationRoutes(app, express, { ...conversations, phase: 'native' });
    },
    registerConversations(app: Application, requestFetch: typeof fetch) {
      registerConversationRoutes(app, express, { ...conversations, phase: 'opencode', fetch: requestFetch });
    },
    archive: {
      setArchived: async (sessionID: string, archived: boolean) => { await registry.ready; return registry.forSession(sessionID).archive.setArchived(sessionID, archived); },
      readArchivedAt: async (sessionID: string, readOptions?: Parameters<OpenCodeSessionArchive['readArchivedAt']>[1]) => { await registry.ready; return registry.forSession(sessionID).archive.readArchivedAt(sessionID, readOptions); },
    },
    close: async () => { await backend.close(); await turnDiffs.close(); stream.close(); },
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
      if (event.properties.type === 'control') options.publish(event);
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
