import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter, once } from 'node:events';
import express from 'express';
import { WebSocket } from 'ws';
import { createAgentBackendHost } from './host.js';
import { createGlobalMessageStreamHub } from '../event-stream/global-hub.js';
import { createMessageStreamWsRuntime, createGlobalUiEventBroadcaster } from '../event-stream/runtime.js';
import { createConversationStorage } from './conversation-storage.js';

test('shared SSE and WebSocket streams deliver native and OpenCode events with resumable history identities', async t => {
  const changes = new EventEmitter();
  const until = async predicate => { while (!predicate()) await once(changes, 'frame', { signal: AbortSignal.timeout(5_000) }); };
  const cleanups = [];
  const cleanup = stop => cleanups.push(stop);
  t.after(async () => { for (const stop of cleanups.reverse()) await stop(); });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conversation-events-'));
  cleanup(() => fs.rm(directory, { recursive: true, force: true }));
  const hub = createGlobalMessageStreamHub({ buildOpenCodeUrl: route => `http://127.0.0.1${route}`, getOpenCodeAuthHeaders: () => ({}) });
  cleanup(() => hub.stop());
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  cleanup(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const host = createAgentBackendHost({
    dataDir: directory, server: () => server, environment: () => process.env, hub,
    initializeSession: async () => {}, readInstructions: async () => [], onUserInput: () => {}, publish: () => {},
    tools: () => { throw new Error('This test does not execute MCP tools'); },
    openCodeClient: () => { throw new Error('This test supplies OpenCode wire events'); },
    openCodeMetadata: { read: async () => ({}), write: async () => {} },
  });
  cleanup(() => host.close());
  host.stream.registerRoutes(app);
  const runtime = createMessageStreamWsRuntime({
    server, conversationStream: host.stream, globalEventHub: hub, wsClients: new Set(),
    buildOpenCodeUrl: route => `http://127.0.0.1${route}`, getOpenCodeAuthHeaders: () => ({}),
    isRequestOriginAllowed: () => true, rejectWebSocketUpgrade: socket => socket.destroy(),
    processForwardedEventPayload() {},
  });
  cleanup(() => runtime.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const controller = new AbortController();
  cleanup(() => controller.abort());
  const response = await fetch(`${base}/api/conversations/events`, { signal: controller.signal });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const sse = [];
  const reading = (async () => {
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += new TextDecoder().decode(chunk);
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        sse.push(JSON.parse(buffer.slice(6, boundary)));
        changes.emit('frame');
        buffer = buffer.slice(boundary + 2);
      }
    }
  })();
  cleanup(async () => { controller.abort(); await reading.catch(error => assert.equal(error.name, 'AbortError')); });
  const live = [];
  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/api/conversations/events/ws`, { origin: base });
  socket.on('message', value => { live.push(JSON.parse(String(value))); changes.emit('frame'); });
  cleanup(() => socket.terminate());
  await until(() => sse.length && live.length);
  assert.equal(live[0].type, 'ready');
  assert.deepEqual(live, sse);
  const broadcast = createGlobalUiEventBroadcaster({ eventHub: hub, sseClients: new Set(), wsClients: new Set(), writeSseEvent() {} });
  broadcast({ type: 'openchamber:session-metadata', properties: { sessionID: 'ses_standard', metadata: { pinned: true } } });
  broadcast({ type: 'openchamber:notification', properties: { sessionId: 'ses_standard', title: 'Finished' } });
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const executable = path.join(directory, 'agy');
  const fixture = fileURLToPath(new URL('./antigravity.fixture.mjs', import.meta.url));
  await fs.writeFile(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`, { mode: 0o700 });
  await host.backend.configure({ binary: executable });
  const session = await host.backend.create(directory, 'Native', 'ses_ag_events');
  await host.backend.send(session.id, { id: 'msg_native', text: 'Hello', files: [], context: [] });
  await host.backend.wait(session.id, controller.signal);
  const raw = (type, data, id) => hub.injectEvent({ directory, spaceId: null, payload: { type, data, id, created: 1, location: { directory } } });
  const status = value => ({ sessionID: 'ses_standard', status: { type: value } });
  raw('session.status', status('busy'), 'standard-busy');
  hub.flushPending();
  const busyCursor = hub.cursor();
  const turnStartedAt = Date.now() - 3_000;
  broadcast({ type: 'openchamber:session-status', properties: { sessionID: 'ses_standard', status: 'busy', timestamp: Date.now() - 1_000, turnStartedAt } });
  raw('session.step.started', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', agent: 'build', model: { id: 'gpt', providerID: 'codex' } }, 'standard-step');
  raw('session.text.started', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', ordinal: 0 }, 'standard-text-start');
  raw('session.text.delta', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', ordinal: 0, delta: 'Hello' }, 'standard-text');
  raw('session.status', status('idle'), 'standard-idle');
  hub.flushPending();
  const idleCursor = hub.cursor();
  await until(() => live.at(-1)?.eventId === idleCursor && sse.at(-1)?.eventId === idleCursor);
  assert.deepEqual(live, sse);
  const events = live.filter(frame => frame.type === 'event').flatMap(frame => frame.payload.events.map(item => item.event));
  assert.equal(events.filter(event => event.type === 'session.created' && event.properties.info.id === session.id).length, 1);
  const history = (await host.backend.messages(session.id, {})).items;
  for (const message of history) {
    assert.ok(events.some(event => event.type === 'message.updated' && event.properties.info.id === message.info.id));
    for (const part of message.parts) assert.deepEqual(events.findLast(event => event.type === 'message.part.updated' && event.properties.part.id === part.id)?.properties.part, part);
  }
  assert.ok(events.some(event => event.type === 'session.idle' && event.properties.sessionID === session.id));
  assert.ok(events.some(event => event.type === 'session.patched' && event.properties.patch.metadata?.pinned === true));
  assert.ok(events.some(event => event.type === 'openchamber.notification' && event.properties.title === 'Finished'));
  assert.ok(events.some(event => event.type === 'message.part.delta' && event.properties.sessionID === 'ses_standard' && event.properties.delta === 'Hello'));
  const stored = createConversationStorage(directory);
  cleanup(() => stored.close());
  assert.equal(stored.message('ses_standard', 'msg_standard').parts[0].text, 'Hello');
  assert.deepEqual(stored.messages(session.id, {}).items, history);
  const resumed = [];
  const reconnect = new WebSocket(`${base.replace('http:', 'ws:')}/api/conversations/events/ws?lastEventId=${busyCursor}`, { origin: base });
  reconnect.on('message', value => { resumed.push(JSON.parse(String(value))); changes.emit('frame'); });
  cleanup(() => reconnect.terminate());
  await until(() => resumed.at(-1)?.eventId === idleCursor);
  assert.equal(resumed[0].replayed, true);
  assert.equal(resumed[0].replayReset, false);
  assert.deepEqual(resumed.slice(1).map(frame => frame.eventId), live.slice(live.findIndex(frame => frame.eventId === busyCursor) + 1).map(frame => frame.eventId));
  const replayedStatus = resumed.slice(1).flatMap(frame => frame.payload.events.map(item => item.event)).find(event => event.type === 'session.status' && event.properties.turnStart);
  assert.deepEqual(replayedStatus.properties.turnStart, { at: turnStartedAt, source: 'host' });
  const reset = [];
  const missing = new WebSocket(`${base.replace('http:', 'ws:')}/api/conversations/events/ws?lastEventId=old-process`, { origin: base });
  missing.on('message', value => { reset.push(JSON.parse(String(value))); changes.emit('frame'); });
  cleanup(() => missing.terminate());
  await until(() => reset.length);
  assert.equal(reset[0].replayReset, true);
});
