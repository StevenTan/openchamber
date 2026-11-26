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

test('conversation HTTP normalizes both backends and adopts the prepared native session', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conversation-http-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const owners = new Map();
  const native = createAntigravityBackend({
    dataDir: directory, initializeSession: async () => {}, readInstructions: async () => [],
    environment: () => process.env, mcpServers: () => [], reassignSession: () => {},
    publish: () => {}, publishForm: () => {},
    registerSession: (id, previous) => { owners.delete(previous); owners.set(id, 'antigravity'); },
    turnDiffs: createTurnDiffRuntime(directory, async () => {}),
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
  const upstream = express();
  upstream.use(express.json());
  upstream.use((req, res) => {
    calls.push({ path: req.path, query: req.query, body: req.body, directory: req.get('x-opencode-directory') });
    if (req.path.endsWith('/missing')) return res.status(404).json({ _tag: 'SessionNotFoundError', message: 'Missing' });
    if (req.path === '/api/session' && req.method === 'GET') return res.json({ data: [wire], cursor: { next: 'next-page' } });
    if (req.path.endsWith('/message') && req.method === 'GET') return res.json({ data: [user], cursor: { next: 'more' } });
    if (req.path.endsWith('/message/msg_standard')) return res.json({ data: user });
    if (req.method === 'DELETE') return res.status(204).end();
    return res.json({ data: wire });
  });
  const upstreamServer = upstream.listen(0, '127.0.0.1');
  await new Promise(resolve => upstreamServer.once('listening', resolve));
  t.after(() => new Promise(resolve => upstreamServer.close(resolve)));
  const registry = createBackendRegistry({ opencode: createOpenCodeAdapter({}, {}), antigravity: createAntigravityAdapter(native) }, owners, Promise.resolve());
  const app = express();
  const client = folder => createOpenCodeClient({ baseUrl: `http://127.0.0.1:${upstreamServer.address().port}`, directory: folder });
  for (const phase of ['native', 'opencode']) registerConversationRoutes(app, express, { registry, client, phase, abortTools: () => {} });
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
  const all = await request(`${root}?global=true`);
  assert.deepEqual(all.sessions.map(session => session.backendID), ['opencode', 'antigravity']);
  assert.equal(all.cursor.next, 'next-page');
  assert.deepEqual((await request(`${root}?cursor=next-page`)).sessions.map(session => session.id), [standard.id]);
  const messages = await request(`${root}/${standard.id}/message?limit=10&partShells=true&cursor=page&order=asc`);
  assert.equal(messages.items[0].info.role, 'user');
  assert.equal(messages.items[0].parts[0].text, 'Hello');
  assert.equal(messages.cursor.next, undefined);
  assert.equal(calls.findLast(call => call.path.endsWith('/message')).query.order, undefined);
  assert.equal((await request(`${root}/${standard.id}/message/msg_standard`)).info.role, 'user');
  const context = await request(`${root}/${created.id}/context`, 'POST', { text: 'Context: ' });
  await request(`${root}/${created.id}/prompt`, 'POST', { id: 'msg_native', text: 'Hello', files: [], context, agents: [], skills: [] });
  await native.wait(created.id, new AbortController().signal);
  const history = await request(`${root}/${created.id}/message`);
  assert.deepEqual(history.items.map(item => item.info.role), ['assistant', 'user']);
  assert.equal(history.items[0].parts[0].text, 'Context: Hello');
  assert.deepEqual(await request(`${root}/${created.id}/message/${history.items[0].info.id}`), history.items[0]);
  await request(`${root}/${created.id}`, 'PATCH', { title: 'Renamed' });
  assert.equal((await request(`${root}/${created.id}`)).title, 'Renamed');
  await request(`${root}/${created.id}/interrupt`, 'POST');
  const failure = await fetch(`${base}${root}/missing`);
  assert.equal(failure.status, 404);
  assert.equal((await failure.json()).tag, 'SessionNotFoundError');
  await request(`${root}/${created.id}`, 'DELETE');
  assert.equal((await fetch(`${base}${root}/${created.id}`)).status, 404);
});
