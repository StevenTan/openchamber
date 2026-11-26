import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { MessageListOptions, MessagePage, MessageRecord } from '@openchamber/sdk/conversations/http';
import { loadSqliteOpener } from '../message-search/sqlite.js';
import type { SqliteConnection } from '../message-search/sqlite.js';
import { recordedTurnDiffSchema } from '@openchamber/sdk/agent-backends';
import { migrateConversationStorage } from './conversation-storage-migration.js';

const messageCursor = z.object({ id: z.string(), order: z.enum(['asc', 'desc']), direction: z.literal('next') });

export function createConversationStorage(dataDir: string) {
  const directory = path.join(dataDir, 'conversations');
  const sessions = path.join(directory, 'sessions');
  fs.mkdirSync(sessions, { recursive: true, mode: 0o700 });
  const open = loadSqliteOpener();
  if (!open) throw new Error('SQLite is unavailable');
  const index = open(path.join(directory, 'index.sqlite'));
  index.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, backend_id TEXT NOT NULL, data TEXT NOT NULL)');
  const connections = new Map<string, SqliteConnection>();
  const file = (id: string) => path.join(sessions, `${encodeURIComponent(id)}.sqlite`);
  const closeSession = (id: string) => { connections.get(id)?.close(); connections.delete(id); };
  const session = <Value>(id: string, work: (db: SqliteConnection) => Value): Value => {
    let db = connections.get(id);
    if (!db) {
      if (connections.size === 5) closeSession(String(connections.keys().next().value));
      db = open(file(id));
      fs.chmodSync(file(id), 0o600);
      db.exec(`PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS messages (
          session_id TEXT NOT NULL, id TEXT NOT NULL, turn_sequence INTEGER NOT NULL,
          ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session_id, id)
        );
        CREATE INDEX IF NOT EXISTS message_order ON messages(session_id, turn_sequence, ordinal);
        CREATE TABLE IF NOT EXISTS turns (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
          id TEXT NOT NULL, model_id TEXT NOT NULL, summary TEXT NOT NULL, data TEXT NOT NULL,
          UNIQUE(session_id, id)
        );
        CREATE INDEX IF NOT EXISTS turn_model ON turns(session_id, model_id, sequence);
        CREATE TABLE IF NOT EXISTS turn_diffs (turn_id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
    }
    connections.delete(id);
    connections.set(id, db);
    return work(db);
  };
  const readSession = <Value>(id: string, work: (db: SqliteConnection) => Value): Value | undefined => fs.existsSync(file(id)) ? session(id, work) : undefined;
  const storage = {
    index,
    session,
    readSession,
    saveMessages(records: MessageRecord[], sequence?: number) {
      for (const [ordinal, record] of records.entries()) {
        session(record.info.sessionID, db => db.run(`INSERT INTO messages(session_id, id, turn_sequence, ordinal, data)
          VALUES (?, ?, COALESCE(?, (SELECT turn_sequence FROM messages WHERE session_id = ? AND id = ?),
            (SELECT COALESCE(MAX(turn_sequence), 0) + 1 FROM messages WHERE session_id = ?)), ?, ?)
          ON CONFLICT(session_id, id) DO UPDATE SET turn_sequence = excluded.turn_sequence, ordinal = excluded.ordinal, data = excluded.data`,
        [record.info.sessionID, record.info.id, sequence ?? null, record.info.sessionID, record.info.id, record.info.sessionID, sequence === undefined ? 0 : ordinal, JSON.stringify(record)]));
      }
    },
    message(id: string, messageID: string): MessageRecord | undefined {
      const row = readSession(id, db => db.get('SELECT data FROM messages WHERE session_id = ? AND id = ?', [id, messageID]));
      return row ? JSON.parse(z.string().parse(row.data)) : undefined;
    },
    messages(id: string, input: MessageListOptions): MessagePage {
      const position = input.cursor ? messageCursor.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString())) : undefined;
      const order = position?.order ?? input.order ?? 'desc';
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      const comparison = order === 'asc' ? '>' : '<';
      const anchor = position ? `AND (turn_sequence, ordinal) ${comparison} (SELECT turn_sequence, ordinal FROM messages WHERE session_id = ? AND id = ?)` : '';
      const limit = input.limit ?? 100;
      const rows = readSession(id, db => db.all(`SELECT data FROM messages WHERE session_id = ? ${anchor}
        ORDER BY turn_sequence ${direction}, ordinal ${direction} LIMIT ?`,
      [id, ...position ? [id, position.id] : [], limit + 1])) ?? [];
      const items: MessageRecord[] = rows.slice(0, limit).map(row => JSON.parse(z.string().parse(row.data)));
      const last = items.at(-1);
      return { items, cursor: last && rows.length > items.length ? { next: Buffer.from(JSON.stringify({ id: last.info.id, order, direction: 'next' })).toString('base64url') } : {} };
    },
    clearMessages(id: string) { session(id, db => db.run('DELETE FROM messages')); },
    saveDiff(record: z.infer<typeof recordedTurnDiffSchema>) {
      session(record.sessionID, db => db.run('INSERT INTO turn_diffs(turn_id, data) VALUES (?, ?) ON CONFLICT(turn_id) DO UPDATE SET data = excluded.data', [record.turnID, JSON.stringify(record)]));
    },
    diff(id: string, turnID: string) {
      const row = readSession(id, db => db.get('SELECT data FROM turn_diffs WHERE turn_id = ?', [turnID]));
      return row ? recordedTurnDiffSchema.parse(JSON.parse(z.string().parse(row.data))) : undefined;
    },
    clearDiffs(id: string) { readSession(id, db => db.run('DELETE FROM turn_diffs')); },
    rename(from: string, to: string) {
      closeSession(from);
      if (fs.existsSync(file(from))) {
        fs.renameSync(file(from), file(to));
        session(to, db => db.transaction(() => {
          db.run('UPDATE turns SET session_id = ?', [to]);
          db.run('UPDATE messages SET session_id = ?', [to]);
          db.run("UPDATE turn_diffs SET data = json_set(data, '$.sessionID', ?)", [to]);
        }));
      }
      index.run("UPDATE sessions SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", [to, to, from]);
    },
    remove(id: string) {
      closeSession(id);
      fs.rmSync(file(id), { force: true });
      index.run('DELETE FROM sessions WHERE id = ?', [id]);
    },
    close() { for (const db of connections.values()) db.close(); connections.clear(); index.close(); },
  };
  migrateConversationStorage(dataDir, open, storage);
  return storage;
}
export type ConversationStorage = ReturnType<typeof createConversationStorage>;
