import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter, once } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AgentBackendRuntime } from './runtime.js';

const cleanup = [];
beforeEach(() => { vi.stubEnv('GEMINI_API_KEY', undefined); });
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); vi.unstubAllEnvs(); });
function fixture(authMethod) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-backends-'));
  cleanup.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const events = new EventEmitter();
  const open = () => {
    const args = [fileURLToPath(new URL('./acp.fixture.mjs', import.meta.url))];
    if (authMethod) args.push(authMethod);
    const runtime = new AgentBackendRuntime(root, (_directory, event) => events.emit(event.kind === 'status' ? event.status : event.kind, event), process.execPath, args);
    cleanup.push(() => runtime.stop());
    return runtime;
  };
  return { root, events, open };
}

test('authenticates with a Gemini API key before creating and restoring sessions', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'local-fixture-key');
  const f = fixture('gemini-api-key');
  const runtime = f.open();
  const session = await runtime.create({ directory: f.root });
  runtime.stop();
  const reopened = f.open();
  const done = once(f.events, 'idle');
  await reopened.prompt(session.id, { messageId: 'msg_authenticated', text: 'Continue' });
  expect((await done)[0].outcome).toBe('succeeded');
  expect(reopened.get(session.id).messages[1].parts.at(-1).text).toBe('Restored: Continue');
});

test('streams ACP content and restores persisted sessions through session/load', async () => {
  const f = fixture();
  const runtime = f.open();
  const session = await runtime.create({ directory: f.root });
  const done = once(f.events, 'idle');
  await runtime.prompt(session.id, { messageId: 'msg_first', text: 'Hello' });
  expect((await done)[0].outcome).toBe('succeeded');
  expect(runtime.get(session.id).messages[1].parts.map(part => part.text)).toEqual(['Thinking', 'Hello']);
  runtime.stop();
  const reopened = f.open();
  expect(reopened.get(session.id).messages).toHaveLength(2);
  const continued = once(f.events, 'idle');
  await reopened.prompt(session.id, { messageId: 'msg_second', text: 'Continue' });
  await continued;
  expect(reopened.get(session.id).messages[3].parts.at(-1).text).toBe('Restored: Continue');
  reopened.patch(session.id, { archivedAt: 123, metadata: { openchamber: { work: { title: 'Task' } } } });
  reopened.patch(session.id, { metadata: { openchamber: { work: { title: null } } } });
  expect(reopened.list()[0]).toMatchObject({ archivedAt: 123, metadata: { openchamber: { work: {} } } });
});

test('answers ACP permission requests and retains file diffs', async () => {
  const f = fixture();
  const runtime = f.open();
  const session = await runtime.create({ directory: f.root });
  const question = once(f.events, 'form');
  const done = once(f.events, 'idle');
  await runtime.prompt(session.id, { messageId: 'msg_edit', text: 'permission' });
  const { form } = (await question)[0];
  expect(runtime.forms(f.root)).toHaveLength(1);
  runtime.answer(session.id, form.id, 'allow');
  await done;
  expect(runtime.forms()).toEqual([]);
  expect(runtime.get(session.id).messages[1].parts[0]).toMatchObject({ type: 'tool', status: 'completed', files: [{ path: 'note.txt', oldText: 'before\n', newText: 'after\n' }] });
});

test('cancels a running ACP turn before deleting its record', async () => {
  const f = fixture();
  const runtime = f.open();
  const session = await runtime.create({ directory: f.root });
  const started = once(f.events, 'delta');
  await runtime.prompt(session.id, { messageId: 'msg_wait', text: 'wait' });
  await started;
  await runtime.remove(session.id);
  expect(runtime.list()).toEqual([]);
  expect(fs.existsSync(path.join(f.root, 'agent-backends', 'antigravity', `${session.id}.json`))).toBe(false);
});
