import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAntigravityStorage, type StoredConversation } from './antigravity-storage.js';
import { createAntigravityBackend } from './antigravity.js';
import type { AcpTurn } from '@openchamber/sdk/agent-backends';
import { DatabaseSync } from 'node:sqlite';

test('disk history pages preserve messages while startup retains only model summaries', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'antigravity-storage-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  const folder = path.join(directory, 'agent-backends', 'antigravity');
  await fs.mkdir(folder, { recursive: true });
  const store = createAntigravityStorage(folder);
  const session: StoredConversation = { id: 'ses_ag_stored', nativeID: 'native-stored', directory, title: 'Stored', created: 1, updated: 2, draft: false, config: [], forms: [], turns: [] };
  const payload = 'large output '.repeat(1024);
  for (let index = 0; index < 150; index++) {
    const turn: AcpTurn = { id: `prompt_${index}`, assistantID: `reply_${index}`, modelID: `model_${index % 2}`, text: `Prompt ${index}`, created: index, completed: index + 1, files: [], followups: [], updates: [{ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `${index}: ${payload}` } }] };
    store.save(session, turn);
  }
  store.close();
  const owners: string[] = [];
  const backend = createAntigravityBackend({ dataDir: directory, turnDiffs: { begin: async () => {}, finish: async () => {}, remove: async () => {} }, environment: () => process.env, mcpServers: () => [], reassignSession: () => {}, initializeSession: async () => {}, readInstructions: async () => [], publish: () => {}, publishForm: () => {}, registerSession: id => owners.push(id) });
  t.after(() => backend.close());
  await backend.ready;
  assert.deepEqual(owners, [session.id]);
  const resident = await backend.get(session.id);
  assert.equal(resident.turns.length, 2);
  assert.ok(resident.turns.every(turn => !turn.text && !turn.updates.length));
  assert.equal((await backend.messages(session.id, {})).items.length, 100);
  for (const order of ['asc', 'desc'] as const) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await backend.messages(session.id, { limit: 17, order, cursor });
      assert.ok(page.items.length <= 17);
      ids.push(...page.items.map(message => message.info.id));
      cursor = page.cursor.next;
    } while (cursor);
    const expected = Array.from({ length: 150 }, (_, index) => [`prompt_${index}`, `reply_${index}`]).flat();
    assert.deepEqual(ids, order === 'asc' ? expected : expected.toReversed());
  }
  assert.equal((await backend.message(session.id, 'reply_149'))?.parts[0]?.type, 'text');
  const trimmed = Buffer.from(JSON.stringify({ id: 'prompt_100', order: 'desc', direction: 'next' })).toString('base64url');
  assert.equal((await backend.messages(session.id, { limit: 1, cursor: trimmed })).items[0]?.info.id, 'reply_99');
  const nativeFolder = path.join(folder, 'profile', 'antigravity-acp', 'conversations');
  await fs.mkdir(nativeFolder, { recursive: true });
  const native = new DatabaseSync(path.join(nativeFolder, `${session.nativeID}.db`));
  native.exec('CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)');
  native.prepare('INSERT INTO gen_metadata VALUES (0, ?)').run(Uint8Array.from([10, 18, 34, 10, 16, 5, 24, 4, 32, 2, 40, 23, 72, 2, 74, 4, 82, 2, 32, 64]));
  native.close();
  const latest = (await backend.messages(session.id, { limit: 1 })).items[0];
  assert.equal(latest?.info.role, 'assistant');
  assert.deepEqual(latest?.info.role === 'assistant' && latest.info.context, { used: 30, limit: 64 });
  const exact = await backend.message(session.id, 'reply_149');
  assert.deepEqual(exact?.info.role === 'assistant' && exact.info.tokens, { input: 5, output: 4, reasoning: 2, cache: { write: 2, read: 23 } });
  assert.ok(exact?.parts.some(part => part.type === 'text' && part.text === `149: ${payload}`));
  await backend.rename(session.id, 'Renamed');
  await backend.archive.setArchived(session.id, true);
  await backend.close();
  const reopened = createAntigravityStorage(folder);
  t.after(() => reopened.close());
  assert.equal(reopened.sessions()[0]?.title, 'Renamed');
  assert.ok(reopened.sessions()[0]?.archived);
  assert.equal(reopened.messages(session.id, { limit: 1 }).items[0]?.info.id, 'reply_149');
  reopened.remove(session.id);
  assert.deepEqual(reopened.sessions(), []);
  assert.equal(reopened.message(session.id, 'reply_149'), undefined);
  assert.equal(reopened.turn(session.id, 'prompt_149'), undefined);
});
