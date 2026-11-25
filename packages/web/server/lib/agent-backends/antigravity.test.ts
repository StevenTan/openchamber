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
import { createOpenCodeClient } from '../openchamber-sessions/opencode-client.js';

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
  const identity = createBackendMcpIdentity();
  const make = () => createAntigravityBackend({ dataDir: directory, environment: () => process.env, mcpServers: id => { identity.token(id); return []; }, reassignSession: identity.reassign, publish, publishForm: () => {} });
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
  await backend.questionSession.synthetic({ sessionID: session.id, id: 'msg_answer', text: 'answer', delivery: 'steer', resume: true });
  await completed;
  assert.deepEqual(session.turns[0]?.followups.map(input => input.text), ['answer']);
  assert.deepEqual(session.turns[0]?.updates.filter(item => item.sessionUpdate === 'agent_message_chunk').map(item => item.content), [{ type: 'text', text: 'working' }, { type: 'text', text: 'answer' }]);
  const usageCompleted = new Promise<void>(resolve => { onCompleted = resolve; });
  await backend.send(session.id, { id: 'msg_usage', text: 'usage', files: [], context: [] });
  await usageCompleted;
  assert.deepEqual(session.turns.at(-1)?.tokens, { input: 5, output: 4, reasoning: 2, cache: { read: 23, write: 2 } });
  assert.deepEqual(session.turns.at(-1)?.context, { used: 30, limit: 64 });
  assert.deepEqual(session.tokens, session.turns.at(-1)?.tokens);
  await backend.close();
  const openCodeArchives: Array<[string, boolean]> = [];
  const host = createAgentBackendHost({
    dataDir: directory, environment: () => process.env, server: () => null,
    tools: () => { throw new Error('Tool runtime is unused'); }, publish: () => {},
    hub: { injectEvent: () => {}, subscribeEvent: () => () => {}, subscribeStatus: () => () => {} },
    openCodeClient: () => createOpenCodeClient({ baseUrl: 'http://127.0.0.1', headers: {}, fetch: async (url, init) => {
      if (init?.method === 'PATCH') { openCodeArchives.push(['ses_opencode', JSON.parse(String(init.body)).archived]); return new Response(null, { status: 204 }); }
      return Response.json({ data: { id: 'ses_opencode', time: { archived: 1234 } } });
    } }),
  });
  cleanups.push(() => host.close());
  await host.archive.setArchived(session.id, true);
  const archivedAt = await host.archive.readArchivedAt(session.id);
  assert.ok(Number.isInteger(archivedAt));
  await host.archive.setArchived('ses_opencode', true);
  assert.equal(await host.archive.readArchivedAt('ses_opencode'), 1234);
  assert.deepEqual(openCodeArchives, [['ses_opencode', true]]);
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
  const make = () => createAntigravityBackend({ dataDir: directory, environment: () => ({ ...process.env, AGY_FIXTURE_REJECT_ACCOUNT: rejectAccount ? '1' : '0' }), mcpServers: () => [], reassignSession: () => {}, publish: () => { events.emit('authentication'); }, publishForm: () => {} });
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
