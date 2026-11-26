import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { MessageRecord } from '@openchamber/sdk/conversations/http';
import { createConversationStorage } from './conversation-storage.js';
import { createAntigravityStorage, type StoredConversation } from './antigravity-storage.js';

test('conversation databases isolate history and diffs while only five remain open', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conversation-storage-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  let storage = createConversationStorage(directory);
  t.after(() => storage.close());
  const sessions = path.join(directory, 'conversations', 'sessions');
  const records: MessageRecord[] = Array.from({ length: 8 }, (_, index) => ({
    info: { id: 'message', sessionID: `session-${index}`, role: 'user', time: { created: index } },
    parts: [{ id: 'text', sessionID: `session-${index}`, messageID: 'message', type: 'text', text: `Text ${index}` }],
  }));
  storage.saveMessages(records);
  assert.equal((await fs.readdir(sessions)).filter(name => name.endsWith('.sqlite')).length, 8);
  assert.deepEqual((await fs.readdir(sessions)).filter(name => name.endsWith('-wal')), Array.from({ length: 5 }, (_, index) => `session-${index + 3}.sqlite-wal`));
  assert.deepEqual(storage.message('session-0', 'message'), records[0]);
  assert.deepEqual((await fs.readdir(sessions)).filter(name => name.endsWith('-wal')), [0, 4, 5, 6, 7].map(index => `session-${index}.sqlite-wal`));
  const diff = { version: 1 as const, sessionID: 'session-0', turnID: 'turn', revision: 1, files: [{ file: 'code.txt', status: 'modified' as const, patch: '-before\n+after', additions: 1, deletions: 1 }] };
  storage.saveDiff(diff);
  const session: StoredConversation = { id: 'session-0', nativeID: 'native', directory, title: 'Saved', created: 1, updated: 2, draft: false, config: [], forms: [], turns: [] };
  createAntigravityStorage(storage).save(session);
  assert.deepEqual(storage.index.all("SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row.name), ['sessions']);
  storage.close();
  storage = createConversationStorage(directory);
  assert.deepEqual(storage.message('session-0', 'message'), records[0]);
  assert.deepEqual(storage.diff('session-0', 'turn'), diff);
  storage.clearMessages('session-0');
  assert.deepEqual(storage.diff('session-0', 'turn'), diff);
  storage.remove('session-0');
  assert.deepEqual(createAntigravityStorage(storage).sessions(), []);
  assert.equal(storage.message('session-0', 'message'), undefined);
  assert.equal(storage.diff('session-0', 'turn'), undefined);
  assert.deepEqual(storage.messages('session-0', {}), { items: [], cursor: {} });
  assert.ok(!(await fs.readdir(sessions)).some(name => name.startsWith('session-0.')));
  assert.deepEqual(storage.message('session-1', 'message'), records[1]);
});

test('backend history and recorded JSON patches migrate into conversation databases', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conversation-storage-import-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  const session: StoredConversation = { id: 'native-session', nativeID: 'native', directory, title: 'Saved', created: 1, updated: 2, draft: false, config: [], forms: [], turns: [] };
  const turn = { id: 'turn', assistantID: 'reply', modelID: 'model', text: 'Prompt', created: 1, completed: 2, files: [], updates: [], followups: [], toolCalls: [] };
  const records: MessageRecord[] = ['opencode-session', session.id].map(sessionID => ({ info: { id: 'message', sessionID, role: 'user', time: { created: 1 } }, parts: [] }));
  for (const record of records) {
    const backend = record.info.sessionID === session.id ? 'antigravity' : 'opencode';
    const root = path.join(directory, 'agent-backends', backend);
    await fs.mkdir(root, { recursive: true });
    const legacy = new DatabaseSync(path.join(root, 'history.sqlite'));
    legacy.exec('CREATE TABLE messages (session_id TEXT, id TEXT, turn_sequence INTEGER, ordinal INTEGER, data TEXT, PRIMARY KEY(session_id, id))');
    legacy.prepare('INSERT INTO messages VALUES (?, ?, 1, 0, ?)').run(record.info.sessionID, 'message', JSON.stringify(record));
    if (backend === 'antigravity') {
      legacy.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, data TEXT); CREATE TABLE turns (sequence INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, id TEXT, model_id TEXT, summary TEXT, data TEXT, UNIQUE(session_id, id))');
      legacy.prepare('INSERT INTO sessions VALUES (?, ?)').run(session.id, JSON.stringify(session));
      legacy.prepare('INSERT INTO turns VALUES (1, ?, ?, ?, ?, ?)').run(session.id, turn.id, turn.modelID, JSON.stringify({ ...turn, text: '' }), JSON.stringify(turn));
    }
    legacy.close();
  }
  const root = path.join(directory, 'turn-diffs', session.id);
  await fs.mkdir(root, { recursive: true });
  const diff = { version: 1, sessionID: session.id, turnID: turn.id, revision: 1, files: [{ file: 'code.txt', status: 'modified', patch: '-before\n+after', additions: 1, deletions: 1 }] };
  await fs.writeFile(path.join(root, 'turn.json'), JSON.stringify(diff));
  let storage = createConversationStorage(directory);
  t.after(() => storage.close());
  for (const record of records) assert.deepEqual(storage.message(record.info.sessionID, 'message'), record);
  assert.deepEqual(createAntigravityStorage(storage).sessions(), [session]);
  assert.deepEqual(createAntigravityStorage(storage).turn(session.id, turn.id), turn);
  assert.deepEqual(storage.diff(session.id, turn.id), diff);
  for (const backend of ['opencode', 'antigravity']) await assert.rejects(fs.stat(path.join(directory, 'agent-backends', backend, 'history.sqlite')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(root, 'turn.json')), { code: 'ENOENT' });
  storage.close();
  storage = createConversationStorage(directory);
  assert.deepEqual(storage.diff(session.id, turn.id), diff);
  assert.deepEqual(createAntigravityStorage(storage).turn(session.id, turn.id), turn);
});
