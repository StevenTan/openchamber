import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type McpServer, type SessionNotification, type RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { z } from 'zod';
import type { AcpConversation, AcpConversationEvent, AcpSend, AcpTurn, AcpPrompt, AgentToolCall } from '@openchamber/sdk/agent-backends';
import type { QuestionSessionApi } from '../agent-question/src/runtime.js';
import { createMessageId } from '../dispatch-results/runtime.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { resolveAntigravityExecutable, installAntigravityExecutable, AntigravityNotInstalledError } from './antigravity-executable.js';
import { createAntigravityAuthentication } from './antigravity-auth.js';
import { readAntigravityUsage } from './antigravity-usage.js';
import { readAntigravityQuota } from './antigravity-quota.js';
import type { createTurnDiffRuntime } from '../turn-diffs/runtime.js';
import type { TurnDiffReference } from '@openchamber/sdk/agent-backends';
import { createAntigravityStorage, type StoredConversation } from './antigravity-storage.js';
import type { MessageListOptions, MessageRecord } from '@openchamber/sdk/conversations/http';

interface Options {
  dataDir: string;
  turnDiffs: Pick<ReturnType<typeof createTurnDiffRuntime>, 'begin' | 'finish' | 'remove'>;
  environment(): NodeJS.ProcessEnv;
  mcpServers(sessionID: string): McpServer[];
  reassignSession(from: string, to: string): void;
  initializeSession(sessionID: string, directory: string): Promise<void>;
  readInstructions(sessionID: string): Promise<Array<{ text: string }>>;
  onUserInput?(sessionID: string, directory: string): void;
  publish(event: AcpConversationEvent): void;
  registerSession?(sessionID: string, previousID?: string): void;
  publishForm(type: 'form.created' | 'form.replied' | 'form.cancelled', data: { form?: Parameters<QuestionSessionApi['form']['create']>[0]; id?: string; sessionID?: string; answer?: Parameters<QuestionSessionApi['form']['reply']>[0]['answer'] }, directory: string): void;
}
const settingsSchema = z.object({ binary: z.string().default('agy') });
const MAX_RESIDENT_SESSIONS = 5;
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

export function createAntigravityBackend(options: Options) {
  const root = path.join(options.dataDir, 'agent-backends', 'antigravity');
  const conversations = new Map<string, StoredConversation>();
  const active = new Map<string, AcpTurn>();
  const prompts = new Map<string, Promise<unknown>>();
  const loaded = new Map<string, string>();
  const inUse = new Map<string, number>();
  let connection: Promise<ClientSideConnection> | undefined;
  let process: ReturnType<typeof spawn> | undefined;
  let settings = { binary: 'agy' };
  let storage: ReturnType<typeof createAntigravityStorage> | undefined;
  const ready = (async () => {
    await fs.mkdir(root, { recursive: true });
    const history = createAntigravityStorage(root);
    storage = history;
    for (const session of history.sessions()) {
      session.turns = history.summaries(session.id);
      conversations.set(session.id, session);
      options.registerSession?.(session.id);
    }
    try { settings = settingsSchema.parse(JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8'))); }
    catch (cause) { if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause; }
  })();
  const history = () => {
    if (!storage) throw new Error('Antigravity storage is closed');
    return storage;
  };
  const save = async (session: StoredConversation, turn?: AcpTurn) => { history().save(session, turn); };
  const refreshUsage = (session: StoredConversation) => {
    const turn = session.turns.at(-1);
    if (!turn?.completed) return;
    const usage = readAntigravityUsage(path.join(root, 'profile', 'antigravity-acp', 'conversations', `${session.nativeID}.db`));
    if (!usage) return;
    session.tokens = usage.sessionTokens;
    turn.tokens = usage.tokens;
    turn.context = usage.context;
  };
  const get = async (id: string) => {
    await ready;
    const session = conversations.get(id);
    if (!session) throw Object.assign(new Error('Conversation not found'), { status: 404 });
    refreshUsage(session);
    return session;
  };
  const publishTurn = (session: AcpConversation, turn: AcpTurn) => options.publish({ type: 'turn', sessionID: session.id, directory: session.directory, turn, session });
  const flushActive = (session: StoredConversation) => {
    const turn = active.get(session.id);
    if (turn) history().save(session, turn);
  };
  const withUsage = (session: StoredConversation, message: MessageRecord) => {
    const turn = session.turns.at(-1);
    if (message.info.role === 'assistant' && message.info.id === turn?.assistantID) {
      message.info = { ...message.info, ...turn.tokens && { tokens: turn.tokens }, ...turn.context && { context: turn.context } };
    }
    return message;
  };
  const update = async (notification: SessionNotification) => {
    const session = [...conversations.values()].find(item => item.nativeID === notification.sessionId);
    if (!session) return;
    if (notification.update.sessionUpdate === 'config_option_update') session.config = notification.update.configOptions;
    if (notification.update.sessionUpdate === 'session_info_update' && notification.update.title) {
      session.title = notification.update.title;
      await save(session);
      options.publish({ type: 'session', session });
    }
    const turn = active.get(session.id);
    if (!turn) return;
    turn.updates.push(notification.update);
    options.publish({ type: 'update', sessionID: session.id, directory: session.directory, turnID: turn.id, update: notification.update, turn, session });
  };
  const requestPermission = async (request: RequestPermissionRequest) => {
    const accept = request.options.find(option => option.kind === 'allow_once');
    return { outcome: accept ? { outcome: 'selected' as const, optionId: accept.optionId } : { outcome: 'cancelled' as const } };
  };
  const launch = async () => {
    if (isEnterpriseMode()) throw Object.assign(new Error('Antigravity is unavailable in enterprise mode'), { status: 403, code: 'enterprise_mode' });
    await ready;
    const environment = options.environment();
    const binary = resolveAntigravityExecutable(root, settings.binary, environment);
    if (!binary) throw new AntigravityNotInstalledError();
    const profile = path.join(root, 'profile');
    return {
      binary,
      args: ['acp', '--process-per-session', '--gemini-dir', profile, '--app-data-dir', 'antigravity-acp', '--agent', 'openchamber', '--include-default-customizations=false', '--disable-telemetry'],
      env: { ...environment, GEMINI_HOME: profile, SSH_CONNECTION: environment.SSH_CONNECTION || '127.0.0.1 0 127.0.0.1 0', AGY_ACP_FORCE_FILE_STORAGE: '1', AGY_CLI_DISABLE_AUTO_UPDATE: '1' },
      cwd: root,
    };
  };
  const connect = () => {
    if (isEnterpriseMode()) throw Object.assign(new Error('Antigravity is unavailable in enterprise mode'), { status: 403, code: 'enterprise_mode' });
    return connection ??= (async () => {
      const command = await launch();
      const agentsDirectory = path.join(root, 'profile', 'config', 'agents', 'openchamber');
      await fs.mkdir(agentsDirectory, { recursive: true });
      const prompt = await fs.readFile(new URL('./antigravity-agent-prompt.txt', import.meta.url), 'utf8');
      await fs.writeFile(path.join(agentsDirectory, 'agent.md'), '---\nname: openchamber\ndescription: OpenChamber assistant\nmainAgent: true\nexcludeDefaultComponents: true\ntools: []\ninheritMcp: true\nskills: []\n---\n' + prompt);
      process = spawn(command.binary, command.args, {
        env: command.env, cwd: command.cwd, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const child = process;
      if (!child.stdin || !child.stdout) throw new Error('Antigravity stdio is unavailable');
      child.stderr?.resume();
      const acp = new ClientSideConnection(() => ({ sessionUpdate: update, requestPermission }), ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
      child.once('error', () => { connection = undefined; });
      child.once('exit', () => { process = undefined; connection = undefined; loaded.clear(); });
      await acp.initialize({ protocolVersion: PROTOCOL_VERSION, clientInfo: { name: 'OpenChamber', version: '2.7.3' }, clientCapabilities: {} });
      return acp;
    })().catch(cause => { connection = undefined; throw cause; });
  };
  const releaseIdleSessions = async (acp: ClientSideConnection, currentID?: string) => {
    for (const [id, nativeID] of loaded) {
      if (loaded.size <= MAX_RESIDENT_SESSIONS) break;
      if (id === currentID || active.has(id) || inUse.has(id)) continue;
      await acp.closeSession({ sessionId: nativeID });
      loaded.delete(id);
    }
  };
  const withSession = async <T>(session: AcpConversation, operation: (acp: ClientSideConnection) => Promise<T>): Promise<T> => {
    const acp = await connect();
    inUse.set(session.id, (inUse.get(session.id) ?? 0) + 1);
    try {
      if (!loaded.has(session.id)) {
        const state = await acp.loadSession({ sessionId: session.nativeID, cwd: session.directory, mcpServers: options.mcpServers(session.id) });
        session.config = state.configOptions ?? [];
      }
      loaded.delete(session.id);
      loaded.set(session.id, session.nativeID);
      return await operation(acp);
    } finally {
      const count = (inUse.get(session.id) ?? 0) - 1;
      if (count) inUse.set(session.id, count);
      else inUse.delete(session.id);
      await releaseIdleSessions(acp, session.id);
    }
  };
  const prepare = async (directory: string) => {
    await ready;
    const draft = [...conversations.values()].find(item => item.draft && item.directory === directory);
    if (draft) return withSession(draft, async () => draft);
    const id = `ses_ag_${randomUUID().replaceAll('-', '')}`;
    const acp = await connect();
    const native = await acp.newSession({ cwd: directory, mcpServers: options.mcpServers(id) });
    const now = Date.now();
    const session: StoredConversation = { id, nativeID: native.sessionId, directory, title: 'New session', created: now, updated: now, draft: true, config: native.configOptions ?? [], turns: [], forms: [] };
    conversations.set(id, session);
    loaded.set(id, native.sessionId);
    await save(session);
    options.registerSession?.(session.id);
    await releaseIdleSessions(acp, id);
    return session;
  };
  const send = async (sessionID: string, input: AcpSend, source: 'user' | 'synthetic' = 'user') => {
    const session = await get(sessionID);
    return withSession(session, async acp => {
      if (source === 'user') options.onUserInput?.(sessionID, session.directory);
      let turn = active.get(sessionID);
      if (turn) turn.followups.push({ id: input.id, text: input.text, files: input.files, created: Date.now() });
      else {
        const model = session.config.find(option => option.category === 'model' && option.type === 'select');
        const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
        turn = { id: input.id, assistantID: createMessageId(Date.now() + 1), modelID: model?.type === 'select' ? model.currentValue : '', ...thought?.type === 'select' && { variant: thought.currentValue }, text: input.text, files: input.files, created: Date.now(), updates: [], followups: [], toolCalls: [] };
        const modelID = turn.modelID;
        session.turns = [...history().summaries(sessionID).filter(item => item.modelID !== modelID), turn];
        active.set(sessionID, turn);
        await options.turnDiffs.begin({ sessionID, turnID: turn.id, directory: session.directory });
      }
      session.updated = Date.now();
      await save(session, turn);
      publishTurn(session, turn);
      const instructions = await options.readInstructions(sessionID);
      const prompt: AcpPrompt = [...instructions, ...input.context].map(item => ({ type: 'text' as const, text: item.text }));
      prompt.push({ type: 'text', text: input.text });
      for (const file of input.files) {
        const data = /^data:([^;,]+);base64,(.*)$/s.exec(file.url);
        if (file.mime.startsWith('image/') && data) prompt.push({ type: 'image', mimeType: file.mime, data: z.string().parse(data[2]) });
        else prompt.push({ type: 'resource_link', uri: file.url, name: file.filename ?? file.url, mimeType: file.mime });
      }
      const responding: Promise<void> = acp.prompt({ sessionId: session.nativeID, prompt }).then(() => {}, cause => { turn.error = errorMessage(cause); }).then(async () => {
        if (prompts.get(sessionID) !== responding) return;
        turn.completed = Date.now();
        await options.turnDiffs.finish(sessionID);
        session.updated = turn.completed;
        active.delete(sessionID);
        prompts.delete(sessionID);
        refreshUsage(session);
        await save(session, turn);
        options.publish({ type: 'session', session });
        publishTurn(session, turn);
        session.turns = history().summaries(sessionID);
        await releaseIdleSessions(acp);
      });
      prompts.set(sessionID, responding);
      return input.id;
    });
  };
  const disconnect = async () => {
    const acp = connection && await connection;
    if (acp) await Promise.all([...active.keys()].map(async id => acp.cancel({ sessionId: (await get(id)).nativeID })));
    await Promise.all(prompts.values());
    if (process && process.exitCode === null) { const exited = once(process, 'exit'); process.kill(); await exited; }
    process = undefined;
    connection = undefined;
    loaded.clear();
  };
  const authentication = createAntigravityAuthentication({
    launch,
    disconnect,
    hasCredentials: () => existsSync(path.join(root, 'profile', 'antigravity-acp', 'antigravity-oauth-token')),
    changed: () => options.publish({ type: 'control', directory: root, payload: { type: 'antigravity.authentication' } }),
    async verify(signal) {
      const stop = () => { process?.kill(); };
      signal.addEventListener('abort', stop, { once: true });
      try {
        const acp = await connect();
        signal.throwIfAborted();
        const session = await acp.newSession({ cwd: root, mcpServers: [] });
        await acp.closeSession({ sessionId: session.sessionId });
      } finally {
        signal.removeEventListener('abort', stop);
      }
    },
    async logout() {
      await disconnect();
      const acp = await connect();
      await acp.logout({});
      await disconnect();
    },
  });
  return {
    get, prepare, send, ready,
    async messages(id: string, input: MessageListOptions) {
      const session = await get(id);
      flushActive(session);
      const page = history().messages(id, input);
      return { ...page, items: page.items.map(message => withUsage(session, message)) };
    },
    async message(id: string, messageID: string) {
      const session = await get(id);
      flushActive(session);
      const message = history().message(id, messageID);
      return message && withUsage(session, message);
    },
    async turn(id: string, turnID: string) { await ready; return active.get(id)?.id === turnID ? active.get(id) : history().turn(id, turnID); },
    async wait(sessionID: string, signal: AbortSignal) {
      signal.throwIfAborted();
      const pending = prompts.get(sessionID) ?? Promise.resolve();
      let abort: () => void;
      const stopped = new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
      });
      await Promise.race([pending, stopped]).finally(() => signal.removeEventListener('abort', abort));
    },
    lookup: (id: string) => conversations.get(id),
    async recordToolCall(id: string, call: AgentToolCall, turnID: string | undefined) {
      const session = await get(id);
      const turn = active.get(id)?.id === turnID ? active.get(id) : turnID && history().turn(id, turnID);
      if (turn) {
        const calls = turn.toolCalls ?? [];
        const index = calls.findIndex(item => item.id === call.id);
        if (index === -1) calls.push(call);
        else calls[index] = call;
        turn.toolCalls = calls;
        await save(session, turn);
        publishTurn(session, turn);
      }
    },
    async recordFileDiff(id: string, reference: TurnDiffReference) {
      const session = await get(id);
      const turn = active.get(id);
      if (!turn) throw new Error('File change has no active turn');
      turn.fileDiff = reference;
      await save(session, turn);
      publishTurn(session, turn);
    },
    async list(directory?: string) { await ready; return [...conversations.values()].filter(item => !item.draft && (!directory || item.directory === directory)); },
    async create(directory: string, title?: string, id?: string) {
      const session = await prepare(directory);
      if (id && id !== session.id) {
        const previous = session.id;
        options.reassignSession(previous, id);
        conversations.delete(previous);
        loaded.delete(previous);
        session.id = id;
        options.registerSession?.(id, previous);
        conversations.set(id, session);
        loaded.set(id, session.nativeID);
        history().rename(previous, id);
      }
      session.draft = false;
      if (title) session.title = title;
      await save(session);
      await options.initializeSession(session.id, session.directory);
      options.publish({ type: 'session', session, created: true });
      return session;
    },
    async metadata(id: string, metadata: import('../openchamber-sessions/session-metadata-store.js').SessionMetadata | undefined) {
      const session = await get(id);
      session.metadata = z.record(z.string(), z.json()).optional().parse(metadata);
      await save(session);
      options.publish({ type: 'session', session });
    },
    async rename(id: string, title: string) { const session = await get(id); session.title = title; await save(session); options.publish({ type: 'session', session }); },
    archive: {
      async setArchived(id: string, archived: boolean) {
        const session = await get(id);
        session.archived = archived ? Date.now() : null;
        await save(session);
        options.publish({ type: 'session', session });
      },
      async readArchivedAt(id: string) { return (await get(id)).archived ?? null; },
    },
    async remove(id: string) {
      const session = await get(id);
      return withSession(session, async acp => {
        await acp.closeSession({ sessionId: session.nativeID });
        history().remove(id);
        await options.turnDiffs.remove(id);
        conversations.delete(id);
        loaded.delete(id);
        options.publish({ type: 'deleted', sessionID: id, directory: session.directory });
      });
    },
    async model(id: string, modelID: string, variant?: string | null) {
      const session = await get(id);
      return withSession(session, async acp => {
        session.config = (await acp.setSessionConfigOption({ sessionId: session.nativeID, configId: 'model', value: modelID })).configOptions;
        if (variant) session.config = (await acp.setSessionConfigOption({ sessionId: session.nativeID, configId: 'thought_level', value: variant })).configOptions;
        await save(session);
        options.publish({ type: 'session', session });
      });
    },
    async abort(id: string) { const session = await get(id); await withSession(session, acp => acp.cancel({ sessionId: session.nativeID })); },
    statuses: () => Object.fromEntries([...active.keys()].map(id => [id, { type: 'busy' as const }])),
    async quota() {
      const acp = await connect();
      await acp.listSessions({});
      return readAntigravityQuota(path.join(root, 'profile'), process?.pid);
    },
    async settings() { await ready; return { ...settings, installed: Boolean(resolveAntigravityExecutable(root, settings.binary, options.environment())) }; },
    async install() {
      if (isEnterpriseMode()) throw Object.assign(new Error('Antigravity is unavailable in enterprise mode'), { status: 403, code: 'enterprise_mode' });
      await ready;
      await installAntigravityExecutable(root, options.environment());
    },
    async configure(input: z.input<typeof settingsSchema>) {
      await ready;
      const next = settingsSchema.parse(input);
      if (next.binary === settings.binary) return;
      await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify(next));
      settings = next;
      await disconnect();
    },
    startAuthentication() {
      if (isEnterpriseMode()) throw Object.assign(new Error('Antigravity is unavailable in enterprise mode'), { status: 403, code: 'enterprise_mode' });
      return authentication.start();
    },
    authentication: () => authentication.state(),
    submitAuthentication: (code: string) => authentication.submit(code),
    cancelAuthentication: () => authentication.cancel(),
    logout: () => authentication.logout(),
    questionSession: {
      get: async input => { await get(input.sessionID); },
      form: {
        async get(input) {
          const form = (await get(input.sessionID)).forms.find(item => item.id === input.formID);
          if (!form) throw Object.assign(new Error('Form not found'), { status: 404 });
          return form;
        },
        async create(input) {
          const session = await get(input.sessionID);
          const form = { ...input, state: { status: 'pending' as const } };
          session.forms.push(form);
          await save(session);
          options.publishForm('form.created', { form }, session.directory);
        },
        async reply(input) {
          const session = await get(input.sessionID);
          const form = session.forms.find(item => item.id === input.formID);
          if (!form) throw Object.assign(new Error('Form not found'), { status: 404 });
          form.state = { status: 'answered', answer: z.record(z.string(), z.string()).parse(input.answer) };
          await save(session);
          options.publishForm('form.replied', { id: input.formID, sessionID: session.id, answer: input.answer }, session.directory);
        },
        async cancel(input) {
          const session = await get(input.sessionID);
          const form = session.forms.find(item => item.id === input.formID);
          if (!form) throw Object.assign(new Error('Form not found'), { status: 404 });
          form.state = { status: 'cancelled' };
          await save(session);
          options.publishForm('form.cancelled', { id: input.formID, sessionID: session.id }, session.directory);
        },
      },
      synthetic: async input => { await send(input.sessionID, { id: input.id ?? createMessageId(Date.now()), text: input.text, files: [], context: [] }, 'synthetic'); },
    } satisfies QuestionSessionApi,
    async close() {
      await authentication.close();
      await disconnect();
      await ready;
      storage?.close();
      storage = undefined;
    },
  };
}
