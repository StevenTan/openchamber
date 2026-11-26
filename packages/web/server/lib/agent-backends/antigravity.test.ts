import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AcpConversationEvent } from '@openchamber/sdk/agent-backends';
import { createAntigravityBackend } from './antigravity.js';
import { createBackendMcpIdentity } from './mcp-identity.js';
import { EventEmitter, once } from 'node:events';
import { createAgentBackendHost } from './host.js';
import { createTurnDiffRuntime } from '../turn-diffs/runtime.js';
import { createOpenCodeClient } from '../openchamber-sessions/opencode-client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFileMcpRuntime } from '../agent-file/mcp.js';
import { createToolActivity } from '../agent-tool/activity.js';
import { createToolPermissions } from '../agent-tool/permissions.js';
import { createSessionInstructions } from '../session-knowledge/instructions.js';
import { createApplicationSessions } from './sessions.js';
import { createScheduledTasksRuntime } from '../scheduled-tasks/runtime.js';
import { createProjectConfigRuntime } from '../projects/project-config.js';
import { createReadSessionDefaults } from '../scheduled-tasks/session-defaults.js';
import { createAgentMemoryActions } from '../agent-memory/actions.js';
import { createAgentMemoryRuntime } from '../agent-memory/runtime.js';
import { createBackendSessionService } from './session-service.js';
import { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import { createChatsScope } from '../scheduled-tasks/chats-scope.js';
import { createBackendRegistry } from './registry.js';
import { createAntigravityAdapter } from './antigravity-adapter.js';
import { createOpenCodeAdapter } from './opencode-adapter.js';
import type { BackendID } from './contracts.js';
import { createWorktreeBootstrapStore } from '../git/worktree-bootstrap-storage.js';
import { createServer } from 'node:http';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('ACP sessions retain streamed history and admit an async answer during a running turn', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-acp-test-'));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'agy');
  const source = fileURLToPath(new URL('./antigravity.fixture.mjs', import.meta.url));
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  await fs.writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(source)} "$@"\n`, { mode: 0o700 });
  let onUpdate = () => {};
  let onCompleted = () => {};
  const publish = (event: AcpConversationEvent) => {
    if (event.type === 'update' && event.update.sessionUpdate === 'agent_message_chunk') onUpdate();
    if (event.type === 'turn' && event.turn.completed) onCompleted();
  };
  const instructions = createSessionInstructions(directory, { put: async () => {}, remove: async () => {} });
  const identity = createBackendMcpIdentity();
  let userInputs = 0;
  let userInputDirectory: string | undefined;
  const owners = new Map<string, BackendID>();
  const turnDiffs = createTurnDiffRuntime(directory, async (id, reference) => backend.recordFileDiff(id, reference));
  const make = () => createAntigravityBackend({ dataDir: directory, initializeSession: async () => {},
      registerSession: (id, previous) => { if (previous) owners.delete(previous); owners.set(id, 'antigravity'); },
      onUserInput: (_id, inputDirectory) => { userInputs++; userInputDirectory = inputDirectory; }, readInstructions: instructions.read, turnDiffs, environment: () => process.env, mcpServers: id => { identity.token(id); return []; }, reassignSession: identity.reassign, publish, publishForm: () => {} });
  const backend = make();
  cleanups.push(() => backend.close());
  await backend.configure({ binary: executable });
  const draft = await backend.prepare(directory);
  const enterprise = process.env.OPENCHAMBER_ENTERPRISE_MODE;
  process.env.OPENCHAMBER_ENTERPRISE_MODE = '1';
  try { await assert.rejects(backend.prepare(directory), { code: 'enterprise_mode', status: 403 }); }
  finally {
    if (enterprise === undefined) delete process.env.OPENCHAMBER_ENTERPRISE_MODE;
    else process.env.OPENCHAMBER_ENTERPRISE_MODE = enterprise;
  }
  assert.equal((await backend.prepare(directory)).nativeID, draft.nativeID);
  const nativeID = draft.nativeID;
  const token = identity.token(draft.id);
  const session = await backend.create(directory, 'Test', 'ses_ag_composer');
  assert.equal(session.id, 'ses_ag_composer');
  assert.equal(session.nativeID, nativeID);
  assert.equal(identity.resolve({ signal: new AbortController().signal, requestId: 1, _meta: { 'openchamber/sessionToken': token } })?.sessionID, session.id);
  await backend.model(session.id, 'second');
  assert.equal(session.config[0]?.type === 'select' && session.config[0].currentValue, 'second');
  const update = new Promise<void>(resolve => { onUpdate = resolve; });
  const completed = new Promise<void>(resolve => { onCompleted = resolve; });
  await backend.send(session.id, { id: 'msg_first', text: 'working', files: [], context: [] });
  await update;
  assert.equal(backend.statuses()[session.id]?.type, 'busy');
  const file = path.join(directory, 'code.txt');
  await fs.writeFile(file, 'before\n');
  const permissions = createToolPermissions({ file: path.join(directory, 'permissions.json'), readPolicy: async () => ({ directory, projectDirectory: directory, rules: [{ action: '*', resource: '*', effect: 'allow' }] }), publish: () => {} });
  const activity = createToolActivity({ dataDir: directory, anchor: () => ({ turnID: 'msg_first', updateIndex: session.turns[0]?.updates.length ?? 0 }), changed: backend.recordToolCall });
  const files = createFileMcpRuntime(permissions, request => ({ sessionID: session.id, callID: String(request.requestId), signal: request.signal, record: activity.record(session.id, String(request.requestId)) }), turnDiffs);
  const fileServer = await files.createServer();
  const fileClient = new Client({ name: 'file-test', version: '1' });
  const [local, remote] = InMemoryTransport.createLinkedPair();
  await fileServer.connect(remote);
  await fileClient.connect(local);
  cleanups.push(async () => { await fileClient.close(); await files.close(); });
  await fileClient.callTool({ name: 'edit', arguments: { path: 'code.txt', oldString: 'before', newString: 'after' } });
  const call = session.turns[0]?.toolCalls?.[0];
  assert.equal(call?.namespace, 'file');
  assert.equal(call?.name, 'edit');
  assert.equal(call?.result?.isError, undefined);
  assert.ok(Array.isArray(call?.metadata?.files));
  const records = (await fs.readFile(path.join(directory, 'tool-activity', `${session.id}.jsonl`), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.match(records.at(-1).call.result.structuredContent.files[0].patch, /-before\n\+after/);
  const memory = createAgentMemoryActions({
    agentMemoryRuntime: createAgentMemoryRuntime({ fsPromises: fs, path, userConfigRoot: directory, projectsDirPath: path.join(directory, 'projects') }),
    createError: message => new Error(message), resolveProjectId: async () => 'project',
  });
  const memoryInput = { action: 'memory.save', scope: 'global', title: 'Testing preference', body: 'Use the shared runtime.' };
  const saved = await activity.record(session.id, 'memory-call')('openchamber', 'memory', memoryInput, async () => {
    const data = await memory.execute('memory.save', memoryInput, directory);
    return { content: [{ type: 'text', text: 'Saved' }], structuredContent: { ok: true, action: 'memory.save', data } };
  });
  assert.ok('saved' in saved.structuredContent.data);
  assert.equal(saved.structuredContent.data.saved, true);
  assert.equal(session.turns[0]?.toolCalls?.at(-1)?.result?.isError, undefined);
  assert.deepEqual(session.turns[0]?.toolCalls?.at(-1)?.metadata, { openchamber: { schemaVersion: 1, action: 'memory.save', description: 'Remember something', ok: true } });
  assert.deepEqual(session.turns[0]?.fileDiff, { turnID: 'msg_first', revision: 1, files: [{ file: 'code.txt', status: 'modified', additions: 1, deletions: 1 }] });
  await backend.questionSession.synthetic({ sessionID: session.id, id: 'msg_answer', text: 'answer', delivery: 'steer', resume: true });
  await completed;
  assert.match((await turnDiffs.read(session.id, 'msg_first')).files?.[0]?.patch ?? '', /-before\n\+after/);
  await assert.rejects(fs.stat(path.join(directory, 'turn-diffs', session.id, 'active', 'msg_first')));
  assert.deepEqual(session.turns[0]?.followups.map(input => input.text), ['answer']);
  assert.deepEqual(session.turns[0]?.updates.filter(item => item.sessionUpdate === 'agent_message_chunk').map(item => item.content), [{ type: 'text', text: 'working' }, { type: 'text', text: 'answer' }]);
  const usageCompleted = new Promise<void>(resolve => { onCompleted = resolve; });
  await backend.send(session.id, { id: 'msg_usage', text: 'usage', files: [], context: [] });
  await usageCompleted;
  assert.deepEqual(session.turns.at(-1)?.tokens, { input: 5, output: 4, reasoning: 2, cache: { read: 23, write: 2 } });
  assert.deepEqual(session.turns.at(-1)?.context, { used: 30, limit: 64 });
  assert.deepEqual(session.tokens, session.turns.at(-1)?.tokens);
  await instructions.put(session.id, directory, 'project', 'project instructions: ');
  await backend.send(session.id, { id: 'msg_instructions', text: 'check', files: [], context: [] });
  await backend.wait(session.id, new AbortController().signal);
  assert.deepEqual(session.turns.at(-1)?.updates.filter(item => item.sessionUpdate === 'agent_message_chunk').map(item => item.content), [{ type: 'text', text: 'project instructions: check' }]);
  await instructions.remove(session.id, directory, 'project');
  assert.deepEqual(await instructions.read(session.id), []);
  const openCodeService = createOpenChamberSessionService({
    dataDir: directory,
    readSettingsFromDiskMigrated: async () => ({}), sanitizeProjects: () => [],
    validateDirectoryPath: async value => ({ ok: true, directory: value ?? directory }),
    buildOpenCodeUrl: route => `http://127.0.0.1:1${route}`, getOpenCodeAuthHeaders: () => ({}),
    worktreeBootstrapStore: createWorktreeBootstrapStore({ filePath: path.join(directory, 'bootstrap.json') }),
    hydrateWorktreeCheckout: async () => { throw new Error('Worktree hydration is unused'); },
  });
  const registry = createBackendRegistry({
    opencode: createOpenCodeAdapter({ setArchived: async () => {}, readArchivedAt: async () => null }, { read: async () => ({}), write: async () => {} }),
    antigravity: createAntigravityAdapter(backend),
  }, owners, backend.ready);
  const service = createBackendSessionService(openCodeService, registry, async () => true, createChatsScope(path.join(directory, 'chats')));
  const selected = await service.create({ backendID: 'opencode', model: 'antigravity/second', directory });
  assert.equal(selected.agent, 'antigravity');
  assert.deepEqual(selected.model, { providerID: 'antigravity', modelID: 'second' });
  const beforeInput = userInputs;
  await service.send(session.id, { prompt: 'Agent follow-up', promptedBySessionId: 'ses_sender' });
  await backend.wait(session.id, new AbortController().signal);
  assert.equal(userInputs, beforeInput);
  await service.send(session.id, { prompt: 'User follow-up' });
  await backend.wait(session.id, new AbortController().signal);
  assert.equal(userInputs, beforeInput + 1);
  assert.equal(userInputDirectory, directory);
  const sessions = createApplicationSessions({ openCode: async () => { throw new Error('OpenCode is unavailable'); }, registry });
  await registry.forSession(session.id).question(() => { throw new Error('OpenCode is unavailable'); }).get({ sessionID: session.id });
  assert.equal((await sessions.get(session.id)).id, session.id);
  assert.deepEqual(await sessions.active(session.id), {});
  const history = await sessions.messages(session.id, { order: 'desc', limit: 1 });
  assert.equal(history.data[0]?.type, 'assistant');
  assert.ok(history.cursor?.next);
  assert.equal((await sessions.messages(session.id, { order: 'desc', limit: 1, cursor: history.cursor.next })).data[0]?.id, session.turns.at(-1)?.id);
  const projectConfigRuntime = createProjectConfigRuntime({ fsPromises: fs, path, projectsDirPath: path.join(directory, 'projects') });
  const scheduled = await projectConfigRuntime.upsertScheduledTask('project', {
    name: 'Scheduled prompt', enabled: false, schedule: { kind: 'daily', times: ['03:00'], timezone: 'UTC' }, execution: { prompt: 'scheduled input', useDefaults: true },
  });
  const scheduler = createScheduledTasksRuntime({
    projectConfigRuntime, listProjects: async () => [{ id: 'project', path: directory }], antigravity: backend,
    buildOpenCodeUrl: route => `http://127.0.0.1:1${route}`, getOpenCodeAuthHeaders: () => ({}),
    waitForOpenCodeReady: async () => { throw new Error('OpenCode is unavailable'); },
    readSessionMetadata: async id => (await backend.get(id)).metadata,
    readSessionDefaults: createReadSessionDefaults({
      readSettings: async () => ({ defaultModel: 'antigravity/fixture', projects: [] }), sanitizeProjects: () => [], chatsScopeID: 'chats',
    }),
  });
  cleanups.push(async () => { scheduler.stop(); });
  await scheduler.start();
  const run = await scheduler.runNow('project', scheduled.task.id);
  assert.equal(run.ok, true);
  assert.ok(run.sessionID);
  assert.ok(run.sessionID.startsWith('ses_ag_'));
  const scheduledSession = await backend.get(run.sessionID);
  await backend.wait(scheduledSession.id, new AbortController().signal);
  assert.equal(scheduledSession.turns[0]?.text, 'scheduled input');
  assert.equal(scheduledSession.turns[0]?.modelID, 'fixture');
  scheduler.stop();
  await backend.close();
  const openCodeArchives: Array<[string, boolean]> = [];
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve())));
  const host = createAgentBackendHost({
    dataDir: directory, initializeSession: async () => {},
    onUserInput: () => {}, readInstructions: async () => [], environment: () => process.env, server: () => listener,
    tools: () => { throw new Error('Tool runtime is unused'); }, publish: () => {},
    openCodeMetadata: { read: async () => ({}), write: async () => {} },
    hub: { injectEvent: () => {}, subscribeEvent: () => () => {}, subscribeStatus: () => () => {}, flushPending: () => {}, cursor: () => 'start', replayAfter: () => [] },
    openCodeClient: () => createOpenCodeClient({ baseUrl: 'http://127.0.0.1', headers: {}, fetch: async (url, init) => {
      if (init?.method === 'PATCH') { openCodeArchives.push([path.basename(new URL(String(url)).pathname), JSON.parse(String(init.body)).archived]); return new Response(null, { status: 204 }); }
      return Response.json({ data: { id: 'ses_opencode', time: { archived: 1234 } } });
    } }),
  });
  cleanups.push(() => host.close());
  const skillFile = path.join(directory, '.agents', 'skills', 'native-host-skill', 'SKILL.md');
  await fs.mkdir(path.dirname(skillFile), { recursive: true });
  await fs.writeFile(skillFile, '---\nname: native-host-skill\ndescription: NATIVE_HOST_SKILL\n---\nNative skill body');
  await host.archive.setArchived(session.id, true);
  const archivedAt = await host.archive.readArchivedAt(session.id);
  assert.ok(Number.isInteger(archivedAt));
  await host.archive.setArchived('ses_opencode', true);
  assert.equal(await host.archive.readArchivedAt('ses_opencode'), 1234);
  await host.archive.setArchived('ses_ag_external', true);
  assert.deepEqual(openCodeArchives, [['ses_opencode', true], ['ses_ag_external', true]]);
  const injected = await host.backend.get(selected.sessionId);
  await host.backend.send(injected.id, { id: 'msg_catalog', text: 'mcp-catalog', files: [], context: [] });
  await host.backend.wait(injected.id, new AbortController().signal);
  const catalog = injected.turns.at(-1)?.updates.flatMap(update => update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text' ? [JSON.parse(update.content.text)] : []).flat();
  assert.deepEqual(catalog, [
    { name: 'openchamber', path: '/api/openchamber/code-mode/mcp' },
    { name: 'openchamber_commands', path: '/api/openchamber/command-tool/mcp' },
    { name: 'file', path: '/api/openchamber/file-tool/mcp' },
    { name: 'browser', path: '/api/openchamber/browser-tool/mcp' },
    { name: 'request', path: '/api/openchamber/async-question/mcp' },
  ]);
  await host.backend.send(injected.id, { id: 'msg_skill_catalog', text: 'skill catalog', files: [], context: [] });
  await host.backend.wait(injected.id, new AbortController().signal);
  const skillText = injected.turns.at(-1)?.updates.flatMap(update => update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text' ? [update.content.text] : []).join('');
  assert.ok(skillText?.includes(skillFile));
  assert.ok(skillText?.includes('NATIVE_HOST_SKILL'));
  const reopened = make();
  cleanups.push(() => reopened.close());
  assert.deepEqual((await reopened.get(session.id)).turns, session.turns);
  assert.equal(await reopened.archive.readArchivedAt(session.id), archivedAt);
  await reopened.archive.setArchived(session.id, false);
  assert.equal(await reopened.archive.readArchivedAt(session.id), null);
  const stopped = new Promise<void>(resolve => { onCompleted = resolve; });
  await reopened.send(session.id, { id: 'msg_stop', text: 'working', files: [], context: [] });
  await reopened.abort(session.id);
  await stopped;
  assert.deepEqual(reopened.statuses(), {});
});

test('Antigravity keeps five recent idle workers and retains running sessions until completion', { timeout: 15_000 }, async context => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-resident-test-'));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'agy');
  const source = fileURLToPath(new URL('./antigravity.fixture.mjs', import.meta.url));
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  await fs.writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(source)} "$@"\n`, { mode: 0o700 });
  const backend = createAntigravityBackend({
    dataDir: directory, initializeSession: async () => {}, readInstructions: async () => [],
    turnDiffs: createTurnDiffRuntime(directory, async () => {}), environment: () => process.env,
    mcpServers: () => [], reassignSession: () => {}, publish: () => {}, publishForm: () => {},
  });
  cleanups.push(() => backend.close());
  await backend.configure({ binary: executable });
  const sessions = [];
  for (let index = 0; index < 5; index++) sessions.push(await backend.create(directory, `Resident ${index}`));
  const [first, second, third] = sessions;
  assert.ok(first);
  assert.ok(second);
  assert.ok(third);
  await backend.model(first.id, 'second');
  sessions.push(await backend.create(directory, 'Resident 5'));
  const journal = path.join(directory, 'agent-backends', 'antigravity', 'profile', 'lifecycle.jsonl');
  const lifecycle = async (): Promise<Array<{ method: string; sessionId: string }>> =>
    (await fs.readFile(journal, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  let calls = await lifecycle();
  assert.deepEqual(calls.filter(call => call.method === 'close').map(call => call.sessionId), [second.nativeID]);
  assert.equal((await backend.get(second.id)).nativeID, second.nativeID);
  assert.equal((await backend.list()).length, 6);
  assert.deepEqual(await lifecycle(), calls);
  await backend.model(second.id, 'second');
  calls = await lifecycle();
  assert.deepEqual(calls.slice(-2), [
    { method: 'load', sessionId: second.nativeID },
    { method: 'close', sessionId: third.nativeID },
  ]);
  for (const session of sessions) {
    await backend.send(session.id, { id: `msg_${session.id}`, text: 'working', files: [], context: [] });
  }
  calls = await lifecycle();
  const resident = new Set<string>();
  for (const call of calls) {
    if (call.method === 'close') resident.delete(call.sessionId);
    else resident.add(call.sessionId);
  }
  assert.equal(resident.size, 6);
  assert.equal(Object.keys(backend.statuses()).length, 6);
  await Promise.all([backend.wait(first.id, context.signal), backend.abort(first.id)]);
  calls = await lifecycle();
  assert.deepEqual(calls.at(-1), { method: 'close', sessionId: first.nativeID });
  assert.equal(Object.keys(backend.statuses()).length, 5);
  assert.equal((await backend.get(first.id)).turns.length, 1);
});

test('MCP headers and nested Code Mode metadata resolve the same host session', () => {
  const identity = createBackendMcpIdentity();
  const token = identity.token('ses_ag_test');
  const context = { signal: new AbortController().signal, requestId: 1 };
  assert.equal(identity.authorize({ 'x-openchamber-session': token }), true);
  assert.equal(identity.resolve({ ...context, requestInfo: { headers: { 'x-openchamber-session': token } } })?.sessionID, 'ses_ag_test');
  assert.equal(identity.resolve({ ...context, _meta: { 'openchamber/sessionToken': token } })?.sessionID, 'ses_ag_test');
  assert.equal(identity.authorize({}), false);
});

test('Google sign-in exposes its URL, accepts a code and verifies ACP access in the same profile', { timeout: 15_000 }, async context => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-auth-test-'));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'agy');
  const source = fileURLToPath(new URL('./antigravity.fixture.mjs', import.meta.url));
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  await fs.writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(source)} "$@"\n`, { mode: 0o700 });
  let rejectAccount = false;
  const events = new EventEmitter();
  const make = () => createAntigravityBackend({ dataDir: directory, initializeSession: async () => {},
      onUserInput: () => {}, readInstructions: async () => [], turnDiffs: createTurnDiffRuntime(directory, async () => {}), environment: () => ({ ...process.env, AGY_FIXTURE_REJECT_ACCOUNT: rejectAccount ? '1' : '0' }), mcpServers: () => [], reassignSession: () => {}, publish: () => { events.emit('authentication'); }, publishForm: () => {} });
  const backend = make();
  cleanups.push(() => backend.close());
  await backend.configure({ binary: executable });
  const wait = async (phase: string) => {
    while (backend.authentication().phase !== phase) await once(events, 'authentication', { signal: context.signal });
  };
  assert.equal(backend.startAuthentication().phase, 'starting');
  await wait('waiting');
  assert.deepEqual(backend.authentication(), { phase: 'waiting', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture' });
  assert.equal(backend.submitAuthentication('fixture-code').phase, 'verifying');
  await wait('succeeded');
  const profile = path.join(directory, 'agent-backends', 'antigravity', 'profile');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'agent-backends', 'antigravity', 'login-environment.json'), 'utf8')), { geminiHome: profile, fileStorage: '1', ssh: process.env.SSH_CONNECTION || '127.0.0.1 0 127.0.0.1 0' });
  assert.deepEqual(await backend.list(), []);
  await backend.close();
  const reopened = make();
  cleanups.push(() => reopened.close());
  assert.equal(reopened.authentication().phase, 'succeeded');
  assert.equal((await reopened.logout()).phase, 'idle');
  backend.startAuthentication();
  await wait('waiting');
  backend.submitAuthentication('wrong-code');
  await wait('failed');
  rejectAccount = true;
  backend.startAuthentication();
  await wait('waiting');
  backend.submitAuthentication('fixture-code');
  await wait('failed');
  const failure = backend.authentication();
  assert.match(failure.phase === 'failed' ? failure.message : '', /Account access denied/);
  rejectAccount = false;
  backend.startAuthentication();
  await wait('waiting');
  assert.equal((await backend.cancelAuthentication()).phase, 'cancelled');
});
