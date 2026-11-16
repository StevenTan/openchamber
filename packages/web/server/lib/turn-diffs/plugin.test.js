import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeTurnDiffPlugin } from './materialize.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

const harness = async (storage = new Map(), directory) => {
  directory ??= await fs.mkdtemp(path.join(os.tmpdir(), 'turn-diff-test-'));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const pluginDirectory = await materializeTurnDiffPlugin({ fsPromises: fs, path, instanceDir: directory });
  const { default: plugin } = await import(pathToFileURL(path.join(pluginDirectory, 'index.js')).href);
  const hooks = {}, handlers = {};
  let turnID = 'user-1', failWrite = false, context;
  const events = [];
  let wake;
  const ctx = {
    location: { directory },
    tool: { hook: async (name, run) => { hooks[name] = run; } },
    session: { context: async () => context ?? [{ type: 'user', id: turnID }, { type: 'assistant', id: 'assistant' }], get: async () => ({}) },
    storage: {
      get: async (key) => structuredClone(storage.get(key)),
      set: async (key, value) => {
        if ((failWrite === true && key.startsWith('turn:')) || (failWrite === 'checkpoint' && key.startsWith('active:') && !value.dirty)) throw new Error('Storage unavailable');
        storage.set(key, structuredClone(value));
      },
      remove: async (key) => { storage.delete(key); },
      scan: async ({ prefix }) => ({ entries: [...storage].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })) }),
    },
    rpc: { register: async (_definition, methods) => Object.assign(handlers, methods) },
    event: { subscribe: async function* ({ signal }) {
      signal.addEventListener('abort', () => wake?.(), { once: true });
      while (!signal.aborted) {
        if (!events.length) await new Promise((resolve) => { wake = resolve; });
        while (events.length) { const { event, done } = events.shift(); yield event; done(); }
      }
    } },
  };
  const stop = await plugin.setup(ctx);
  cleanups.push(async () => {
    await stop();
    for (const [key, value] of storage) if (key.startsWith('active:')) await fs.rm(value.temporaryDirectory, { recursive: true, force: true });
  });
  let callID = 0;
  const tool = async (name, input, mutate, status = 'completed', identity = {}) => {
    const event = { tool: name, input, id: `call-${++callID}`, messageID: 'assistant', sessionID: 'session', ...identity };
    await hooks['execute.before'](event);
    await mutate();
    const result = {};
    const settled = { ...event, status };
    if (status === 'completed') settled.result = result;
    else settled.error = result;
    await hooks['execute.after'](settled);
    return result.metadata.openchamberTurnDiff;
  };
  return {
    directory, storage, stop, tool,
    read: (id = turnID, sessionID = 'session') => handlers.read({ sessionID, turnID: id }),
    turn: (id) => { turnID = id; },
    context: (messages) => { context = messages; },
    failWrite: (value) => { failWrite = value; },
    event: (type, data = {}) => new Promise((done) => { events.push({ event: { type, data: { sessionID: 'session', ...data } }, done }); wake?.(); }),
  };
};

describe('recorded turn file diffs', () => {
  it.each(['answered', 'cancelled'])('aligns an asynchronous question %s with its displayed turn boundary', async (status) => {
    const h = await harness();
    const a = path.join(h.directory, 'a');
    const b = path.join(h.directory, 'b');
    const user = { id: 'user-1', type: 'user' };
    const first = { id: 'first', type: 'assistant', finish: 'tool-calls' };
    await fs.writeFile(a, 'a before\n');
    await fs.writeFile(b, 'b before\n');
    h.context([user, first]);
    await h.tool('edit', { path: a }, () => fs.writeFile(a, 'a after\n'), 'completed', { messageID: 'first' });
    const response = { question_id: 'question', status };
    if (status === 'answered') response.answers = [{ question: 'Choice', answer: 'Yes' }];
    h.context([user, first, { id: 'reply', type: 'synthetic', metadata: { source: 'openchamber-async-question' }, text: JSON.stringify({ type: 'async_question_response', responses: [response] }) }, { id: 'second', type: 'assistant' }]);
    await h.tool('edit', { path: b }, () => fs.writeFile(b, 'b after\n'), 'completed', { messageID: 'second' });
    expect((await h.read()).files.map((file) => file.file)).toEqual(status === 'answered' ? ['a'] : ['a', 'b']);
    if (status === 'answered') expect((await h.read('reply')).files.map((file) => file.file)).toEqual(['b']);
  });

  it('keeps the first disk baseline and persists a net patch across repeated edits and reloads', async () => {
    const h = await harness();
    const file = path.join(h.directory, 'code.txt');
    await fs.writeFile(file, '    original\n');
    await h.tool('edit', { path: file }, () => fs.writeFile(file, '    middle\n'));
    const metadata = await h.tool('write', { path: file, content: 'unformatted' }, () => fs.writeFile(file, '    formatted\n'));
    expect(metadata.files).toEqual([{ file: 'code.txt', status: 'modified', additions: 1, deletions: 1 }]);
    expect(metadata.files[0]).not.toHaveProperty('patch');
    expect((await h.read()).files[0].patch).toContain('-    original\n+    formatted\n');
    await h.stop();
    const reloaded = await harness(h.storage, h.directory);
    expect((await reloaded.read()).files[0].patch).toContain('+    formatted');
    await reloaded.tool('edit', { path: file }, () => fs.writeFile(file, '    original\n'));
    expect((await reloaded.read()).files).toEqual([]);
  });

  it('keeps historical turns independent of subsequent disk contents', async () => {
    const h = await harness();
    const file = path.join(h.directory, 'file');
    await fs.writeFile(file, 'zero\n');
    await h.tool('edit', { path: file }, () => fs.writeFile(file, 'one\n'));
    await h.event('session.execution.succeeded');
    h.turn('user-2');
    await h.tool('edit', { path: file }, () => fs.writeFile(file, 'two\n'));
    await h.event('session.execution.succeeded');
    await fs.writeFile(file, 'unrelated\n');
    expect((await h.read('user-1')).files[0].patch).toContain('-zero\n+one\n');
    expect((await h.read('user-2')).files[0].patch).toContain('-one\n+two\n');
    expect([...h.storage.keys()].filter((key) => key.startsWith('active:'))).toEqual([]);
  });

  it('captures external files, empty additions, deletions and partial writes from failed patch calls', async () => {
    const h = await harness();
    const external = await fs.mkdtemp(path.join(os.tmpdir(), 'turn-diff-external-'));
    cleanups.push(() => fs.rm(external, { recursive: true, force: true }));
    const file = path.join(external, 'new.txt');
    await h.tool('write', { path: file }, () => fs.writeFile(file, ''));
    expect((await h.read()).files).toMatchObject([{ file, status: 'added', additions: 0, deletions: 0 }]);
    await h.tool('patch', { patchText: `*** Begin Patch\n*** Update File: ${file}\n*** Delete File: missing\n*** End Patch` }, () => fs.writeFile(file, 'partial\n'), 'error');
    expect((await h.read()).files[0].patch).toContain('+partial');
    await h.tool('patch', { patchText: `*** Begin Patch\n*** Delete File: ${file}\n*** End Patch` }, () => fs.unlink(file));
    expect((await h.read()).files).toEqual([]);
    await h.event('session.execution.interrupted', { reason: 'user' });
    expect([...h.storage.keys()].some((key) => key.startsWith('active:'))).toBe(false);
  });

  it('preserves exact CRLF bytes and the missing final newline marker', async () => {
    const h = await harness();
    const file = path.join(h.directory, 'crlf');
    await fs.writeFile(file, 'old\r\nlast');
    await h.tool('edit', { path: file }, () => fs.writeFile(file, 'new\r\nlast'));
    expect((await h.read()).files[0].patch).toContain('-old\r\n+new\r\n last\n\\ No newline at end of file');
  });

  it('retains the baseline after a failed persistence and reports capture failure', async () => {
    const h = await harness();
    const file = path.join(h.directory, 'file');
    await fs.writeFile(file, 'zero\n');
    await h.tool('edit', { path: file }, () => fs.writeFile(file, 'one\n'));
    h.failWrite(true);
    expect(await h.tool('edit', { path: file }, () => fs.writeFile(file, 'two\n'))).toMatchObject({ error: 'Storage unavailable' });
    await h.event('session.execution.failed');
    const active = h.storage.get('active:session:user-1');
    expect(await fs.readFile(active.files[file].original, 'utf8')).toBe('zero\n');
    expect(active.dirty).toBe(true);
    h.failWrite(false);
    await h.tool('edit', { path: file }, () => fs.writeFile(file, 'three\n'));
    expect((await h.read()).files[0].patch).toContain('-zero\n+three\n');
  });

  it('distinguishes missing capture from a recorded empty diff', async () => {
    const h = await harness();
    expect(await h.read()).toMatchObject({ unavailable: true });
    await h.event('session.step.started', { assistantMessageID: 'assistant' });
    await h.event('session.execution.succeeded');
    expect(await h.read()).toMatchObject({ files: [], revision: 0 });
  });

  it('retains a dirty baseline when the active checkpoint cannot be persisted', async () => {
    const h = await harness();
    const file = path.join(h.directory, 'file');
    await fs.writeFile(file, 'before\n');
    h.failWrite('checkpoint');
    expect(await h.tool('edit', { path: file }, () => fs.writeFile(file, 'after\n'))).toMatchObject({ error: 'Storage unavailable' });
    expect(await h.read()).toMatchObject({ unavailable: true });
    await h.event('session.execution.succeeded');
    const active = h.storage.get('active:session:user-1');
    expect(active.dirty).toBe(true);
    expect(await fs.readFile(active.files[file].original, 'utf8')).toBe('before\n');
  });

  it('compares symlink targets as file contents', async () => {
    const h = await harness();
    const target = path.join(h.directory, 'target');
    const link = path.join(h.directory, 'link');
    await fs.writeFile(target, 'before\n');
    await fs.symlink(target, link);
    await h.tool('edit', { path: link }, () => fs.writeFile(link, 'after\n'));
    expect((await h.read()).files).toEqual([{
      file: 'link', status: 'modified', additions: 1, deletions: 1,
      patch: 'diff --git a/link b/link\n--- a/link\n+++ b/link\n@@ -1 +1 @@\n-before\n+after\n',
    }]);
  });

  it('stores a small patch for a localized edit in a large file', async () => {
    const h = await harness();
    const file = path.join(h.directory, 'large.txt');
    await fs.writeFile(file, 'line\n'.repeat(6_000_000));
    await h.tool('edit', { path: file }, async () => {
      const active = h.storage.get('active:session:user-1');
      expect((await fs.stat(active.files[file].original)).size).toBe(30_000_000);
      const handle = await fs.open(file, 'r+');
      await handle.write('edit\n', 0, 'utf8');
      await handle.close();
    });
    const record = await h.read();
    expect(record.files[0]).toMatchObject({ additions: 1, deletions: 1 });
    expect(JSON.stringify(record).length).toBeLessThan(1000);
  });

  it('keeps failed patch generation unavailable and retains its manifest', async () => {
    const h = await harness();
    const file = path.join(h.directory, 'file');
    const other = path.join(h.directory, 'other');
    await fs.writeFile(file, 'before\n');
    await fs.writeFile(other, 'other before\n');
    await h.tool('patch', { patchText: '*** Begin Patch\n*** Update File: file\n*** Update File: other\n*** End Patch' }, async () => {
      const active = h.storage.get('active:session:user-1');
      await fs.unlink(active.files[file].original);
      await fs.writeFile(file, 'after\n');
      await fs.writeFile(other, 'other after\n');
    });
    await h.event('session.execution.succeeded');
    expect(h.storage.has('active:session:user-1')).toBe(true);
    expect((await h.read()).files[0]).toMatchObject({ file: 'file', error: expect.any(String) });
    expect((await h.read()).files[1].patch).toContain('-other before\n+other after\n');
    await h.event('session.deleted');
    expect([...h.storage.keys()]).toEqual([]);
  });

  it('scopes repeated provider call IDs to their session and assistant step', async () => {
    const h = await harness();
    const a = path.join(h.directory, 'a');
    const b = path.join(h.directory, 'b');
    await fs.writeFile(a, 'a before\n');
    await fs.writeFile(b, 'b before\n');
    let release, started;
    const wait = new Promise((resolve) => { release = resolve; });
    const ready = new Promise((resolve) => { started = resolve; });
    const first = h.tool('edit', { path: a }, async () => { started(); await wait; await fs.writeFile(a, 'a after\n'); }, 'completed', { sessionID: 'one', id: 'same-call' });
    await ready;
    await h.tool('edit', { path: b }, () => fs.writeFile(b, 'b after\n'), 'completed', { sessionID: 'two', id: 'same-call' });
    release();
    await first;
    expect((await h.read('user-1', 'one')).files.map((file) => file.file)).toEqual(['a']);
    expect((await h.read('user-1', 'two')).files.map((file) => file.file)).toEqual(['b']);
  });
});
