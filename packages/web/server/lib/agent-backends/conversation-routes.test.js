import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createOpenCodeClient } from '../openchamber-sessions/opencode-client.js';
import { createAntigravityBackend } from './antigravity.js';
import { createAntigravityAdapter } from './antigravity-adapter.js';
import { createOpenCodeAdapter } from './opencode-adapter.js';
import { createBackendRegistry } from './registry.js';
import { registerConversationRoutes } from './conversation-routes.js';
import { createTurnDiffRuntime } from '../turn-diffs/runtime.js';
import { createToolPermissions } from '../agent-tool/permissions.js';
import { registerToolPermissionRoutes } from '../agent-tool/permission-routes.js';
import { createQuestionRuntime } from '../agent-question/src/runtime.js';
import { registerQuestionFormRoutes } from '../agent-question/src/mcp.js';
import { createConversationStorage } from './conversation-storage.js';
import { createOpenCodeHistory } from './opencode-history.js';
import { createConversationCatalog } from './conversation-catalog.js';

test('conversation HTTP normalizes both backends and adopts the prepared native session', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conversation-http-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const owners = new Map();
  const delivered = Promise.withResolvers();
  const cancellation = Promise.withResolvers();
  const storage = createConversationStorage(directory);
  const native = createAntigravityBackend({
    storage,
    dataDir: directory, initializeSession: async () => {}, readInstructions: async () => [],
    environment: () => process.env, mcpServers: () => [], reassignSession: () => {},
    publish: event => {
      if (event.type !== 'turn' || !event.turn.completed) return;
      if (event.turn.text.includes('Blue')) delivered.resolve(event.turn.text);
      if (event.turn.text.includes('cancelled')) cancellation.resolve(event.turn.text);
    }, publishForm: () => {},
    registerSession: (id, previous) => { owners.delete(previous); owners.set(id, 'antigravity'); },
    turnDiffs: createTurnDiffRuntime(directory, async () => {}, storage),
  });
  t.after(() => native.close());
  const executable = path.join(directory, 'agy');
  const fixture = fileURLToPath(new URL('./antigravity.fixture.mjs', import.meta.url));
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  await fs.writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`, { mode: 0o700 });
  await native.configure({ binary: executable });
  const draft = await native.prepare(directory);
  const nativeID = draft.nativeID;
  const wire = { id: 'ses_standard', projectID: 'project', title: 'Standard', location: { directory }, agent: 'build', cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: 1, updated: 1 } };
  const user = { id: 'msg_standard', type: 'user', text: 'Hello', files: [], time: { created: 2 } };
  const calls = [];
  const upstreamForm = { id: 'frm_native', sessionID: wire.id, title: 'Choose', fields: [{ key: 'color', type: 'string' }], state: { status: 'pending' } };
  const upstreamPermission = { id: 'per_native', sessionID: wire.id, action: 'shell', resources: ['pwd'] };
  let pendingFailure = false;
  let statusFailure = false;
  const upstream = express();
  upstream.use(express.json());
  upstream.use((req, res) => {
    calls.push({ path: req.path, query: req.query, body: req.body, directory: req.get('x-opencode-directory') });
    if (req.path === '/api/session/active') return statusFailure ? res.status(503).json({ _tag: 'ServiceUnavailableError', message: 'Statuses unavailable' }) : res.json({ data: { [wire.id]: { type: 'running' } } });
    if (req.path === '/api/location') return res.json({ directory, project: { id: 'project', directory, canonical: directory } });
    if (req.path === '/api/config') return res.json([{ type: 'document', info: { default_agent: 'build', model: 'codex/gpt' } }, { type: 'document', info: { default_agent: 'codex' } }]);
    if (req.path === '/api/project') return res.json([{ id: 'project', canonical: directory, time: { created: 1, updated: 2 }, sandboxes: [] }]);
    if (req.path === '/api/vcs') return res.json({ location: { directory }, data: { branch: { current: 'main', default: 'main' } } });
    if (req.path === '/api/form' || req.path === '/api/permission/request') {
      if (pendingFailure) return res.status(503).json({ _tag: 'ServiceUnavailableError', message: 'Pending requests unavailable' });
      return res.json({ location: { directory }, data: req.path === '/api/form' ? [upstreamForm] : [upstreamPermission] });
    }
    if (req.path.includes('/form/') || req.path.includes('/permission/')) return res.status(204).end();
    if (req.path.endsWith('/missing')) return res.status(404).json({ _tag: 'SessionNotFoundError', message: 'Missing' });
    if (req.path === '/api/session' && req.method === 'GET') return res.json(req.query.cursor ? { data: [{ ...wire, id: 'ses_standard_next' }], cursor: {} } : { data: [wire], cursor: { next: 'next-page' } });
    if (req.path.endsWith('/message') && req.method === 'GET') return res.json(req.query.cursor ? { data: [], cursor: {} } : { data: [user], cursor: { next: 'more' } });
    if (req.path.endsWith('/message/msg_standard')) return res.json({ data: user });
    if (req.method === 'DELETE') return res.status(204).end();
    return res.json({ data: wire });
  });
  const upstreamServer = upstream.listen(0, '127.0.0.1');
  await new Promise(resolve => upstreamServer.once('listening', resolve));
  t.after(() => new Promise(resolve => upstreamServer.close(resolve)));
  const openCodeHistory = createOpenCodeHistory(storage);
  t.after(() => openCodeHistory.close());
  const app = express();
  const client = folder => createOpenCodeClient({ baseUrl: `http://127.0.0.1:${upstreamServer.address().port}`, directory: folder });
  const catalog = createConversationCatalog(storage.catalog, { opencode: createOpenCodeAdapter(openCodeHistory), antigravity: createAntigravityAdapter(native) }, client, () => {});
  const registry = createBackendRegistry(catalog.adapters, owners, native.ready, catalog.list);
  const permissions = createToolPermissions({ file: path.join(directory, 'permissions.json'), readPolicy: async sessionID => ({ directory: sessionID === 'elsewhere' ? '/elsewhere' : directory, projectDirectory: directory, rules: [] }), publish: () => {} });
  const questions = createQuestionRuntime({ dataDir: directory, client: () => ({ session: native.questionSession }), globalEventHub: { subscribeEvent: () => () => {}, subscribeStatus: () => () => {} }, isSessionArchived: async () => false, isEnabled: () => true, retryMs: 1 });
  t.after(() => questions.stop());
  registerQuestionFormRoutes(questions, app, express);
  registerToolPermissionRoutes(app, express, { permissions, directory: async req => req.query.directory, listNative: async () => ({ location: { directory }, data: [upstreamPermission] }) });
  for (const phase of ['native', 'opencode']) registerConversationRoutes(app, express, { registry, client, phase, abortTools: () => {}, permissions });
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  const base = `http://127.0.0.1:${listener.address().port}`;
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json' }, ...body && { body: JSON.stringify(body) } });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const root = '/api/conversations';
  const folder = `?directory=${encodeURIComponent(directory)}`;
  const created = await request(`${root}${folder}`, 'POST', { backendID: 'antigravity', id: 'ses_ag_http', title: 'Native', model: { providerID: 'antigravity', id: 'second' } });
  assert.equal(created.backendID, 'antigravity');
  assert.equal(created.model.id, 'second');
  assert.equal((await native.get(created.id)).nativeID, nativeID);
  assert.equal(created.turns, undefined);
  owners.set('ordinary-native-id', 'antigravity');
  assert.equal((await fetch(`${base}${root}/ordinary-native-id`)).status, 404);
  const standard = await request(`${root}${folder}`, 'POST', { backendID: 'opencode', title: 'Standard' });
  assert.equal(standard.backendID, 'opencode');
  assert.equal(standard.directory, directory);
  const skillFile = path.join(directory, '.agents', 'skills', 'http-skill', 'SKILL.md');
  await fs.mkdir(path.dirname(skillFile), { recursive: true });
  await fs.writeFile(skillFile, '---\nname: http-skill\ndescription: HTTP skill\n---\nHTTP_SKILL_BODY');
  for (const id of [created.id, standard.id]) {
    assert.deepEqual(await request(`${root}/${id}/skills`, 'POST', { names: ['http-skill', 'missing-skill'] }), {
      attached: [{ id: 'http-skill', name: 'http-skill' }], unresolved: ['missing-skill'],
    });
  }
  await request(`${root}/${standard.id}/prompt`, 'POST', { id: 'msg_skill', text: 'Use the skill', files: [], context: [], agents: [], skills: [{ id: 'http-skill' }] });
  const standardSkill = calls.findLast(call => call.path.endsWith('/synthetic'));
  assert.ok(standardSkill.body.text.includes('HTTP_SKILL_BODY'));
  assert.ok(standardSkill.body.text.includes(skillFile));
  assert.equal(calls.findLast(call => call.path.endsWith('/prompt')).body.skills, undefined);
  const runtime = '/api/conversation-runtime';
  assert.deepEqual(await request(`${runtime}/location${folder}`), { directory, project: { id: 'project', directory, canonical: directory } });
  assert.equal(calls.at(-1).directory, encodeURIComponent(directory));
  assert.deepEqual(await request(`${runtime}/configuration${folder}`), { defaultAgent: 'codex', defaultModel: 'codex/gpt' });
  assert.deepEqual(await request(`${runtime}/projects${folder}`), [{ id: 'project', worktree: directory, time: { created: 1, updated: 2 }, sandboxes: [] }]);
  assert.deepEqual(await request(`${runtime}/vcs${folder}`), { branch: 'main', defaultBranch: 'main' });
  assert.deepEqual(await request(`${runtime}/configuration${folder}&backendID=antigravity`), { defaultAgent: 'antigravity' });
  assert.deepEqual(await request(`${runtime}/location${folder}&backendID=antigravity`), { directory, project: { id: directory, directory, canonical: await fs.realpath(directory) } });
  assert.deepEqual(await request(`${runtime}/projects?backendID=antigravity`), [{ id: directory, worktree: directory, time: { created: 0, updated: 0 }, sandboxes: [] }]);
  assert.deepEqual(await request(`${runtime}/vcs${folder}&backendID=antigravity`), {});
  const all = await request(`${root}?global=true&limit=2`);
  assert.deepEqual(all.sessions.map(session => session.backendID), ['antigravity', 'opencode']);
  assert.ok(all.cursor.next);
  assert.deepEqual((await request(`${root}?cursor=${all.cursor.next}`)).sessions.map(session => session.id), ['ses_standard']);
  await t.test('native and mixed session lists continue every backend through its final page', async () => {
    const extra = await native.create(directory, 'Native extra');
    const last = await native.create(directory, 'Native last');
    const ascending = [];
    for (const order of ['asc', 'desc']) {
      let next;
      const ids = [];
      do {
        const query = new URLSearchParams({ backendID: 'antigravity', limit: '1', order });
        if (next) query.set('cursor', next);
        const result = await request(`${root}?${query}`);
        assert.equal(result.sessions.length, 1);
        ids.push(result.sessions[0].id);
        next = result.cursor.next;
      } while (next);
      assert.deepEqual(new Set(ids), new Set([created.id, extra.id, last.id]));
      assert.equal(ids.length, 3);
      if (order === 'asc') ascending.push(...ids);
      else assert.deepEqual(ids, ascending.toReversed());
    }
    let next;
    const ids = [];
    do {
      const query = new URLSearchParams({ global: 'true', limit: '1' });
      if (next) query.set('cursor', next);
      const result = await request(`${root}?${query}`);
      assert.equal(result.sessions.length, 1);
      ids.push(...result.sessions.map(session => session.id));
      next = result.cursor.next;
    } while (next);
    assert.deepEqual(new Set(ids), new Set([standard.id, 'ses_standard_next', created.id, extra.id, last.id]));
    assert.equal(ids.length, 5);
    await native.remove(extra.id);
    await native.remove(last.id);
  });
  const messages = await request(`${root}/${standard.id}/message?limit=10&partShells=true&order=asc`);
  assert.equal(messages.items[0].info.role, 'user');
  assert.equal(messages.items[0].parts[0].text, 'Hello');
  assert.equal(messages.cursor.next, undefined);
  assert.equal(calls.findLast(call => call.path.endsWith('/message')).query.order, 'asc');
  assert.equal((await request(`${root}/${standard.id}/message/msg_standard`)).info.role, 'user');
  const context = await request(`${root}/${created.id}/context`, 'POST', { text: 'Context: ' });
  await request(`${root}/${created.id}/prompt`, 'POST', { id: 'msg_native', text: 'Hello', files: [], context, agents: [], skills: [{ id: 'http-skill' }] });
  await native.wait(created.id, new AbortController().signal);
  const history = await request(`${root}/${created.id}/message`);
  assert.deepEqual(history.items.map(item => item.info.role), ['assistant', 'user']);
  assert.ok(history.items[0].parts[0].text.startsWith('Context: Skill: http-skill'));
  assert.ok(history.items[0].parts[0].text.includes('HTTP_SKILL_BODY'));
  assert.ok(history.items[0].parts[0].text.includes(skillFile));
  assert.deepEqual(await request(`${root}/${created.id}/message/${history.items[0].info.id}`), history.items[0]);
  await t.test('native message pages retain direction and insertion order', async () => {
    for (const order of ['asc', 'desc']) {
      const first = await request(`${root}/${created.id}/message?limit=1&order=${order}`);
      assert.equal(first.items.length, 1);
      assert.ok(first.cursor.next);
      const second = await request(`${root}/${created.id}/message?limit=1&cursor=${first.cursor.next}`);
      assert.equal(second.items.length, 1);
      assert.equal(second.cursor.next, undefined);
      assert.deepEqual([...first.items, ...second.items], order === 'desc' ? history.items : history.items.toReversed());
    }
    const trimmed = Buffer.from(JSON.stringify({ id: history.items[0].info.id, order: 'desc', direction: 'next' })).toString('base64url');
    const restored = await request(`${root}/${created.id}/message?limit=1&cursor=${trimmed}`);
    assert.deepEqual(restored.items, history.items.slice(1));
    assert.equal(restored.cursor.next, undefined);
  });
  await native.send(created.id, { id: 'msg_working', text: 'working', files: [], context: [], agents: [], skills: [] });
  assert.deepEqual(await request(`${runtime}/statuses${folder}`), { [wire.id]: { type: 'busy' }, [created.id]: { type: 'busy' } });
  statusFailure = true;
  assert.equal((await fetch(`${base}${runtime}/statuses${folder}`)).ok, false);
  statusFailure = false;
  await native.abort(created.id);
  await native.wait(created.id, new AbortController().signal);
  assert.deepEqual(await request(`${runtime}/statuses${folder}`), { [wire.id]: { type: 'busy' } });
  await request(`${root}/${created.id}`, 'PATCH', { title: 'Renamed' });
  assert.equal((await request(`${root}/${created.id}`)).title, 'Renamed');
  await t.test('host titles, archive and metadata drive both HTTP and application session reads', async () => {
    const before = calls.length;
    for (const session of [standard, created]) {
      const adapter = registry.forSession(session.id);
      await request(`${root}/${session.id}`, 'PATCH', { title: `Host ${session.backendID}` });
      await adapter.metadata.write(session.id, { pinned: true });
      await adapter.archive.setArchived(session.id, true);
      const info = await request(`${root}/${session.id}`);
      assert.equal(info.title, `Host ${session.backendID}`);
      assert.deepEqual(info.metadata, { pinned: true });
      assert.ok(info.time.archived);
      assert.equal((await adapter.sessions(client).get(session.id)).title, info.title);
      const stale = storage.catalog.record({ type: 'session.patched', properties: { sessionID: session.id, patch: { title: 'Native title', metadata: {}, time: { archived: null, updated: 123 } } } });
      assert.equal(stale.properties.patch.title, info.title);
      assert.deepEqual(stale.properties.patch.metadata, { pinned: true });
      assert.equal(stale.properties.patch.time.archived, info.time.archived);
      assert.equal((await request(`${root}?search=HOST&backendID=${session.backendID}${folder.replace('?', '&')}`)).sessions[0].id, session.id);
      assert.equal((await adapter.sessions(client).list({ archived: true, directory })).data[0].id, session.id);
      await adapter.archive.setArchived(session.id, false);
      await adapter.metadata.write(session.id, {});
      assert.equal((await request(`${root}/${session.id}`)).time.archived, undefined);
    }
    assert.equal(calls.length, before);
    assert.equal(await registry.forSession('missing').metadata.read('missing'), null);
  });
  await request(`${root}/${created.id}/interrupt`, 'POST');
  const approvalSession = await permissions.session(created.id);
  const granted = approvalSession.assert({ action: 'edit', resources: ['a.txt'], save: ['a.txt'] }, new AbortController().signal);
  const ownPermission = permissions.list()[0].request;
  assert.deepEqual((await request(`/api/conversation-requests/permissions${folder}`)).map(item => item.id), [upstreamPermission.id, ownPermission.id]);
  const permitted = await fetch(`${base}${root}/${created.id}/permission/${ownPermission.id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'once' }) });
  assert.equal(permitted.status, 204);
  await granted;
  assert.deepEqual((await request(`/api/conversation-requests/permissions${folder}`)).map(item => item.id), [upstreamPermission.id]);
  const otherApproval = await permissions.session('elsewhere');
  const rejected = otherApproval.assert({ action: 'edit', resources: ['b.txt'], save: [] }, new AbortController().signal);
  const rejection = assert.rejects(rejected, /Stop/);
  const otherPermission = permissions.list()[0].request;
  assert.deepEqual((await request(`/api/conversation-requests/permissions${folder}`)).map(item => item.id), [upstreamPermission.id]);
  assert.equal((await fetch(`${base}${root}/elsewhere/permission/${otherPermission.id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'reject', message: 'Stop' }) })).status, 204);
  await rejection;
  await request(`${root}/${wire.id}/permission/${upstreamPermission.id}/reply${folder}`, 'POST', { decision: 'always', message: 'Approved' });
  assert.deepEqual(calls.at(-1).body, { decision: 'always', message: 'Approved' });
  const question = await questions.ask({ sessionID: created.id, callID: 'color', input: { questions: [{ title: 'Color', options: ['Blue', 'Green'] }] } });
  assert.deepEqual((await request(`/api/conversation-requests/forms${folder}`)).map(item => item.id), [upstreamForm.id, question.question_id]);
  assert.deepEqual((await request('/api/conversation-requests/forms?directory=/elsewhere')).map(item => item.id), [upstreamForm.id]);
  const answered = await fetch(`${base}${root}/${created.id}/form/${question.question_id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: { q0: 'Blue' } }) });
  assert.equal(answered.status, 204);
  assert.match(await delivered.promise, /Blue/);
  assert.deepEqual((await request(`/api/conversation-requests/forms${folder}`)).map(item => item.id), [upstreamForm.id]);
  const cancelledQuestion = await questions.ask({ sessionID: created.id, callID: 'cancel-color', input: { questions: [{ title: 'Another color' }] } });
  assert.equal((await fetch(`${base}${root}/${created.id}/form/${cancelledQuestion.question_id}`, { method: 'DELETE' })).status, 204);
  assert.match(await cancellation.promise, /cancelled/);
  assert.deepEqual((await request(`/api/conversation-requests/forms${folder}`)).map(item => item.id), [upstreamForm.id]);
  await request(`${root}/${wire.id}/form/${upstreamForm.id}/reply${folder}`, 'POST', { answer: { color: 'Green', count: 3, enabled: true, tags: ['one', 'two'] } });
  assert.deepEqual(calls.at(-1).body.answer, { color: 'Green', count: 3, enabled: true, tags: ['one', 'two'] });
  await request(`${root}/${wire.id}/form/${upstreamForm.id}${folder}`, 'DELETE', { message: 'Skip' });
  assert.equal(calls.at(-1).query.message, 'Skip');
  pendingFailure = true;
  assert.equal((await fetch(`${base}/api/conversation-requests/forms${folder}`)).ok, false);
  pendingFailure = false;
  const failure = await fetch(`${base}${root}/missing`);
  assert.equal(failure.status, 404);
  assert.equal((await failure.json()).tag, 'SessionNotFoundError');
  await request(`${root}/${created.id}`, 'DELETE');
  assert.equal((await fetch(`${base}${root}/${created.id}`)).status, 404);
});
