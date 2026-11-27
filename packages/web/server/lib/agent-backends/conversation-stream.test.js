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
import { createMessageQueueRuntime } from '../message-queue/runtime.js';
import { createCodeModeMcpRuntime } from '../agent-code-mode/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createLaterPages } from '../openchamber-control/later-pages.js';

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
  const probeStarted = Promise.withResolvers();
  const finishProbe = Promise.withResolvers();
  cleanup(() => finishProbe.resolve());
  app.get('/probe', async (_req, res) => { probeStarted.resolve(); await finishProbe.promise; res.send('fetch-proof'); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  cleanup(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const queue = createMessageQueueRuntime({ dataDir: directory, globalEventHub: hub, buildOpenCodeUrl: route => `http://127.0.0.1${route}`, getOpenCodeAuthHeaders: () => ({}), sendPrompt: (...args) => host.input.send(...args) });
  cleanup(async () => { queue.stop(); await queue.flush(); });
  const host = createAgentBackendHost({
    queue,
    dataDir: directory, server: () => server, environment: () => process.env, hub,
    initializeSession: async () => {}, readInstructions: async () => [], onUserInput: () => {}, publish: () => {},
    tools: () => { throw new Error('This test does not execute MCP tools'); },
    openCodeClient: () => ({}),
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
  const untilEvent = predicate => until(() => live.some(frame => frame.type === 'event' && frame.payload.events.some(item => predicate(item.event))));
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
  await host.input.deliver(session.id, directory, { type: 'context', context: { id: 'msg_staged', text: 'Saved context: ', description: 'Background answer', metadata: { question: 'first' }, resume: false } });
  assert.equal((await host.backend.messages(session.id, {})).items.some(item => item.info.id === 'msg_staged'), false);
  await host.input.deliver(session.id, directory, { type: 'prompt', prompt: { id: 'msg_working', text: 'working', files: [], context: [], agents: [], skills: [] } });
  await untilEvent(event => event.type === 'message.part.updated' && event.properties.part.text?.endsWith('Saved context: working'));
  const beforeSteer = (await host.backend.messages(session.id, { order: 'asc' })).items.at(-1);
  const codeMode = createCodeModeMcpRuntime([], extra => host.toolOptions.applicationContext({ ...extra, _meta: { 'ai.opencode/sessionID': session.id } }), { session: async () => ({ assert: async () => {}, denied: () => false }) });
  const codeServer = await codeMode.createServer();
  const [codeLocal, codeRemote] = InMemoryTransport.createLinkedPair();
  const codeClient = new Client({ name: 'conversation-test', version: '1' });
  cleanup(async () => { await codeClient.close(); await codeServer.close(); });
  await codeServer.connect(codeRemote);
  await codeClient.connect(codeLocal);
  const fetching = codeClient.callTool({ name: 'execute', arguments: { code: `return { answer: 42, page: await (await fetch(${JSON.stringify(`${base}/probe`)})).text() }` } });
  await probeStarted.promise;
  const progress = (await host.backend.messages(session.id, { order: 'asc' })).items.at(-1)?.parts.find(part => part.type === 'tool' && part.tool === 'openchamber_execute');
  assert.equal(progress?.state.status, 'running');
  assert.equal(progress?.state.metadata?.openchamberToolCalls?.[0]?.tool, 'fetch');
  assert.equal(progress?.state.metadata?.openchamberToolCalls?.[0]?.status, 'running');
  finishProbe.resolve();
  await fetching;
  const finishTool = Promise.withResolvers();
  const context = host.toolOptions.applicationContext({ _meta: { 'ai.opencode/sessionID': session.id }, requestId: 'mcp-call', signal: controller.signal });
  const tool = context.record('file', 'edit', { path: 'code.txt' }, () => finishTool.promise);
  await untilEvent(event => event.type === 'message.parts.replaced' && event.properties.parts.some(part => part.type === 'tool' && part.tool === 'file_edit' && part.state.status === 'running'));
  await host.input.deliver(session.id, directory, { type: 'context', context: { id: 'msg_answer', text: 'Steer now', description: 'Question answer', metadata: { question: 'second' }, delivery: 'steer' } });
  const result = { content: [{ type: 'text', text: 'Edited file' }, { type: 'image', mimeType: 'image/png', data: 'AA==' }], _meta: { files: [{ filePath: 'code.txt', before: 'a', after: 'b' }] } };
  finishTool.resolve(result);
  await tool;
  await host.backend.wait(session.id, controller.signal);
  const ordered = (await host.backend.messages(session.id, { order: 'asc' })).items;
  assert.deepEqual(ordered.slice(2).map(item => item.info.id), ['msg_staged', 'msg_working', beforeSteer.info.id, 'msg_answer', 'msg_answer_assistant']);
  assert.deepEqual(ordered[2].info.metadata, { question: 'first' });
  assert.equal(ordered[4].info.finish, 'stop');
  assert.equal(ordered[2].info.description, 'Background answer');
  assert.equal(ordered[5].info.role, 'synthetic');
  assert.deepEqual(ordered[5].info.metadata, { question: 'second' });
  assert.equal(ordered[5].info.description, 'Question answer');
  const recordedTool = ordered[4].parts.find(part => part.type === 'tool' && part.tool === 'file_edit');
  assert.equal(recordedTool.state.output, 'Edited file');
  assert.deepEqual(recordedTool.state.metadata.files, result._meta.files);
  assert.equal(recordedTool.state.attachments[0].url, 'data:image/png;base64,AA==');
  const script = ordered[4].parts.find(part => part.type === 'tool' && part.tool === 'openchamber_execute');
  assert.equal(script.state.status, 'completed');
  assert.match(script.state.output, /42/);
  assert.deepEqual(script.state.metadata.openchamberToolCalls.map(call => ({ tool: call.tool, status: call.status })), [{ tool: 'fetch', status: 'completed' }]);
  assert.equal(ordered[6].parts.some(part => part.type === 'tool'), false);
  assert.ok(ordered[6].parts[0].text.endsWith('Steer now'));
  assert.equal(ordered[6].parts[0].text.includes('Saved context: '), false);
  const pageDelivered = Promise.withResolvers();
  const pages = createLaterPages({ dataDir: directory, deliver: async (...args) => {
    const id = await host.input.deliver(...args);
    pageDelivered.resolve();
    return id;
  } });
  await pages.open({ sessionId: session.id, callId: 'page_answer', title: 'Choose', directory });
  await pages.answer({ sessionId: session.id, callId: 'page_answer', summary: 'Layout B', data: { layout: 'B' } });
  await pageDelivered.promise;
  await host.backend.wait(session.id, controller.signal);
  const answer = (await host.backend.messages(session.id, { order: 'asc' })).items.find(item => item.info.role === 'synthetic' && item.info.metadata?.source === 'openchamber-page-answer');
  assert.equal(answer?.info.metadata.callId, 'page_answer');
  assert.ok(answer?.info.text.includes('Layout B'));
  const raw = (type, data, id) => hub.injectEvent({ directory, spaceId: null, payload: { type, data, id, created: 1, location: { directory } } });
  raw('session.created', { sessionID: 'ses_standard', projectID: directory, title: 'Native title', location: { directory } }, 'standard-created');
  hub.flushPending();
  await host.registry.forSession('ses_standard').sessions(() => { throw new Error('Rename uses the host index'); }).rename('ses_standard', 'Host title');
  const status = value => ({ sessionID: 'ses_standard', status: { type: value } });
  raw('session.status', status('busy'), 'standard-busy');
  hub.flushPending();
  const busyCursor = hub.cursor();
  raw('session.renamed', { sessionID: 'ses_standard', title: 'Generated title' }, 'standard-title');
  const turnStartedAt = Date.now() - 3_000;
  broadcast({ type: 'openchamber:session-status', properties: { sessionID: 'ses_standard', status: 'busy', timestamp: Date.now() - 1_000, turnStartedAt } });
  raw('session.step.started', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', agent: 'build', model: { id: 'gpt', providerID: 'codex' } }, 'standard-step');
  raw('session.text.started', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', ordinal: 0 }, 'standard-text-start');
  raw('session.text.delta', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', ordinal: 0, delta: 'Hello' }, 'standard-text');
  raw('session.tool.input.started', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', id: 'native-call', name: 'file_edit' }, 'standard-native-tool');
  raw('session.tool.input.delta', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', id: 'native-call', delta: '{"path":"code.txt"}' }, 'standard-native-input');
  raw('session.tool.called', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', id: 'native-call', input: { path: 'code.txt' }, executed: true }, 'standard-native-called');
  hub.flushPending();
  const direct = host.toolOptions.applicationContext({ _meta: { 'ai.opencode/sessionID': 'ses_standard', 'openchamber/source': { messageID: 'msg_standard', id: 'native-call' } }, requestId: 123, signal: controller.signal });
  await direct.record('file', 'edit', { path: 'code.txt' }, async () => ({ content: [{ type: 'text', text: 'Edited OpenCode' }] }));
  raw('session.tool.success', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', id: 'native-call', output: 'Native envelope', content: [], executed: true }, 'standard-native-success');
  raw('session.tool.input.started', { sessionID: 'ses_standard', assistantMessageID: 'msg_standard', id: 'external-call', name: 'file_edit' }, 'standard-external-tool');
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
    for (const part of message.parts) {
      const emitted = events.flatMap(event => event.type === 'message.part.updated' ? [event.properties.part] : event.type === 'message.parts.replaced' ? event.properties.parts : []);
      assert.deepEqual(emitted.findLast(item => item.id === part.id), part);
    }
  }
  assert.ok(events.some(event => event.type === 'session.idle' && event.properties.sessionID === session.id));
  assert.ok(events.some(event => event.type === 'session.patched' && event.properties.patch.metadata?.pinned === true));
  assert.equal(events.findLast(event => event.type === 'session.patched' && event.properties.sessionID === 'ses_standard' && 'title' in event.properties.patch)?.properties.patch.title, 'Host title');
  assert.ok(events.some(event => event.type === 'openchamber.notification' && event.properties.title === 'Finished'));
  assert.ok(events.some(event => event.type === 'message.part.delta' && event.properties.sessionID === 'ses_standard' && event.properties.delta === 'Hello'));
  const stored = createConversationStorage(directory);
  cleanup(() => stored.close());
  assert.equal(stored.message('ses_standard', 'msg_standard').parts[0].text, 'Hello');
  const standardTools = stored.message('ses_standard', 'msg_standard').parts.filter(part => part.type === 'tool');
  assert.equal(standardTools.length, 2);
  assert.equal(standardTools.find(part => part.id === 'native-call').state.output, 'Edited OpenCode');
  assert.ok(standardTools.find(part => part.id === 'external-call'));
  assert.equal(events.some(event => event.type === 'message.tool.transition' && event.properties.partID === 'native-call' && event.properties.transition.kind === 'success'), false);
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
  assert.equal(resumed.slice(1).flatMap(frame => frame.payload.events.map(item => item.event)).find(event => event.type === 'session.patched' && 'title' in event.properties.patch)?.properties.patch.title, 'Host title');
  const reset = [];
  const missing = new WebSocket(`${base.replace('http:', 'ws:')}/api/conversations/events/ws?lastEventId=old-process`, { origin: base });
  missing.on('message', value => { reset.push(JSON.parse(String(value))); changes.emit('frame'); });
  cleanup(() => missing.terminate());
  await until(() => reset.length);
  assert.equal(reset[0].replayReset, true);
});
