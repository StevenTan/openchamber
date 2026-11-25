import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, type McpServer, type SessionNotification, type RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { z } from 'zod';
import type { AcpConversation, AcpConversationEvent, AcpSend, AcpTurn, AcpPrompt } from '@openchamber/sdk/agent-backends';
import type { QuestionSessionApi } from '../agent-question/src/runtime.js';
import { createMessageId } from '../dispatch-results/runtime.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { resolveAntigravityExecutable, installAntigravityExecutable, AntigravityNotInstalledError } from './antigravity-executable.js';
import { createAntigravityAuthentication } from './antigravity-auth.js';
import { readAntigravityUsage } from './antigravity-usage.js';

interface Options {
  dataDir: string;
  environment(): NodeJS.ProcessEnv;
  mcpServers(sessionID: string): McpServer[];
  reassignSession(from: string, to: string): void;
  publish(event: AcpConversationEvent): void;
  publishForm(type: 'form.created' | 'form.replied' | 'form.cancelled', data: { form?: Parameters<QuestionSessionApi['form']['create']>[0]; id?: string; sessionID?: string; answer?: Parameters<QuestionSessionApi['form']['reply']>[0]['answer'] }, directory: string): void;
}
const settingsSchema = z.object({ binary: z.string().default('agy') });
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
type StoredConversation = AcpConversation & { forms: Array<Parameters<QuestionSessionApi['form']['create']>[0] & { state: { status: 'pending' | 'answered' | 'cancelled'; answer?: Record<string, string> } }> };

export function createAntigravityBackend(options: Options) {
  const root = path.join(options.dataDir, 'agent-backends', 'antigravity');
  const conversations = new Map<string, StoredConversation>();
  const active = new Map<string, AcpTurn>();
  const prompts = new Map<string, Promise<unknown>>();
  const loaded = new Set<string>();
  let connection: Promise<ClientSideConnection> | undefined;
  let process: ReturnType<typeof spawn> | undefined;
  let settings = { binary: 'agy' };
  const ready = (async () => {
    await fs.mkdir(root, { recursive: true });
    for (const name of await fs.readdir(root)) {
      if (!name.startsWith('ses_ag_') || !name.endsWith('.json')) continue;
      const session: StoredConversation = JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
      conversations.set(session.id, session);
    }
    try { settings = settingsSchema.parse(JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8'))); }
    catch (cause) { if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause; }
  })();
  const save = (session: StoredConversation) => fs.writeFile(path.join(root, `${session.id}.json`), JSON.stringify(session));
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
  const publishTurn = (session: AcpConversation, turn: AcpTurn) => options.publish({ type: 'turn', sessionID: session.id, directory: session.directory, turn });
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
    options.publish({ type: 'update', sessionID: session.id, directory: session.directory, turnID: turn.id, update: notification.update });
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
      await fs.writeFile(path.join(agentsDirectory, 'agent.md'), '---\nname: openchamber\ndescription: OpenChamber assistant\nmainAgent: true\nexcludeDefaultComponents: true\ntools: []\ninheritMcp: true\n---\nUse the OpenChamber MCP tools to carry out the user’s request.\n');
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
  const load = async (session: AcpConversation) => {
    const acp = await connect();
    if (!loaded.has(session.id)) {
      const state = await acp.loadSession({ sessionId: session.nativeID, cwd: session.directory, mcpServers: options.mcpServers(session.id) });
      session.config = state.configOptions ?? [];
      loaded.add(session.id);
    }
    return acp;
  };
  const prepare = async (directory: string) => {
    await ready;
    const draft = [...conversations.values()].find(item => item.draft && item.directory === directory);
    if (draft) { await load(draft); return draft; }
    const id = `ses_ag_${randomUUID().replaceAll('-', '')}`;
    const acp = await connect();
    const native = await acp.newSession({ cwd: directory, mcpServers: options.mcpServers(id) });
    const now = Date.now();
    const session: StoredConversation = { id, nativeID: native.sessionId, directory, title: 'New session', created: now, updated: now, draft: true, config: native.configOptions ?? [], turns: [], forms: [] };
    conversations.set(id, session);
    loaded.add(id);
    await save(session);
    return session;
  };
  const send = async (sessionID: string, input: AcpSend) => {
    const session = await get(sessionID);
    const acp = await load(session);
    let turn = active.get(sessionID);
    if (turn) turn.followups.push({ id: input.id, text: input.text, files: input.files, created: Date.now() });
    else {
      const model = session.config.find(option => option.category === 'model' && option.type === 'select');
      const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
      turn = { id: input.id, assistantID: createMessageId(Date.now() + 1), modelID: model?.type === 'select' ? model.currentValue : '', ...thought?.type === 'select' && { variant: thought.currentValue }, text: input.text, files: input.files, created: Date.now(), updates: [], followups: [] };
      session.turns.push(turn);
      active.set(sessionID, turn);
    }
    session.updated = Date.now();
    await save(session);
    publishTurn(session, turn);
    const prompt: AcpPrompt = [...input.context.map(item => ({ type: 'text' as const, text: item.text })), { type: 'text', text: input.text }];
    for (const file of input.files) {
      const data = /^data:([^;,]+);base64,(.*)$/s.exec(file.url);
      if (file.mime.startsWith('image/') && data) prompt.push({ type: 'image', mimeType: file.mime, data: z.string().parse(data[2]) });
      else prompt.push({ type: 'resource_link', uri: file.url, name: file.filename ?? file.url, mimeType: file.mime });
    }
    const responding: Promise<void> = acp.prompt({ sessionId: session.nativeID, prompt }).then(() => {}, cause => { turn.error = errorMessage(cause); }).then(async () => {
      if (prompts.get(sessionID) !== responding) return;
      turn.completed = Date.now();
      session.updated = turn.completed;
      active.delete(sessionID);
      prompts.delete(sessionID);
      refreshUsage(session);
      await save(session);
      options.publish({ type: 'session', session });
      publishTurn(session, turn);
    });
    prompts.set(sessionID, responding);
    return input.id;
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
    get, prepare, send,
    lookup: (id: string) => conversations.get(id),
    async list(directory?: string) { await ready; return [...conversations.values()].filter(item => !item.draft && (!directory || item.directory === directory)); },
    async create(directory: string, title?: string, id?: string) {
      const session = await prepare(directory);
      if (id && id !== session.id) {
        const previous = session.id;
        options.reassignSession(previous, id);
        conversations.delete(previous);
        loaded.delete(previous);
        session.id = id;
        conversations.set(id, session);
        loaded.add(id);
        await fs.rename(path.join(root, `${previous}.json`), path.join(root, `${id}.json`));
      }
      session.draft = false;
      if (title) session.title = title;
      await save(session);
      options.publish({ type: 'session', session });
      return session;
    },
    async rename(id: string, title: string) { const session = await get(id); session.title = title; await save(session); options.publish({ type: 'session', session }); },
    async remove(id: string) { const session = await get(id); await (await load(session)).closeSession({ sessionId: session.nativeID }); await fs.unlink(path.join(root, `${id}.json`)); conversations.delete(id); loaded.delete(id); options.publish({ type: 'deleted', sessionID: id, directory: session.directory }); },
    async model(id: string, modelID: string, variant?: string | null) {
      const session = await get(id);
      const acp = await load(session);
      session.config = (await acp.setSessionConfigOption({ sessionId: session.nativeID, configId: 'model', value: modelID })).configOptions;
      if (variant) session.config = (await acp.setSessionConfigOption({ sessionId: session.nativeID, configId: 'thought_level', value: variant })).configOptions;
      await save(session);
      options.publish({ type: 'session', session });
    },
    async abort(id: string) { const session = await get(id); await (await load(session)).cancel({ sessionId: session.nativeID }); },
    statuses: () => Object.fromEntries([...active.keys()].map(id => [id, { type: 'busy' }])),
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
          return { state: { status: form.state.status, ...form.state.status === 'answered' && { answer: z.record(z.string(), z.string()).parse(form.state.answer) } } };
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
      synthetic: async input => { await send(input.sessionID, { id: input.id ?? createMessageId(Date.now()), text: input.text, files: [], context: [] }); },
    } satisfies QuestionSessionApi,
    async close() {
      await authentication.close();
      await disconnect();
    },
  };
}
