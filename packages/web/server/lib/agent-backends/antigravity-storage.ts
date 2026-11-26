import path from 'node:path';
import { z } from 'zod';
import type { AcpConversation, AcpTurn } from '@openchamber/sdk/agent-backends';
import { acpMessages } from '@openchamber/sdk/conversations/antigravity';
import type { MessageListOptions, MessagePage, MessageRecord } from '@openchamber/sdk/conversations/http';
import type { QuestionSessionApi } from '../agent-question/src/runtime.js';
import { loadSqliteOpener } from '../message-search/sqlite.js';

export type StoredConversation = AcpConversation & { forms: Array<Parameters<QuestionSessionApi['form']['create']>[0] & { state: { status: 'pending' | 'answered' | 'cancelled'; answer?: Record<string, string> } }> };

const messageCursor = z.object({ id: z.string(), order: z.enum(['asc', 'desc']), direction: z.literal('next') });
const summary = (turn: AcpTurn): AcpTurn => ({ ...turn, text: '', files: [], updates: [], followups: [], toolCalls: [] });

export function createAntigravityStorage(directory: string) {
  const open = loadSqliteOpener();
  if (!open) throw new Error('SQLite is unavailable');
  const db = open(path.join(directory, 'history.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS turns (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL, id TEXT NOT NULL, model_id TEXT NOT NULL,
      summary TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(session_id, id)
    );
    CREATE INDEX IF NOT EXISTS turn_session ON turns(session_id, sequence);
    CREATE INDEX IF NOT EXISTS turn_model ON turns(session_id, model_id, sequence);
    CREATE TABLE IF NOT EXISTS messages (
      session_id TEXT NOT NULL, id TEXT NOT NULL, turn_sequence INTEGER NOT NULL,
      ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session_id, id)
    );
    CREATE INDEX IF NOT EXISTS message_order ON messages(session_id, turn_sequence, ordinal);
  `);
  const saveTurn = (session: StoredConversation, turn: AcpTurn) => {
    db.run(`INSERT INTO turns(session_id, id, model_id, summary, data) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, id) DO UPDATE SET summary = excluded.summary, data = excluded.data`,
    [session.id, turn.id, turn.modelID, JSON.stringify(summary(turn)), JSON.stringify(turn)]);
    const sequence = z.number().parse(db.get('SELECT sequence FROM turns WHERE session_id = ? AND id = ?', [session.id, turn.id])?.sequence);
    for (const [ordinal, message] of acpMessages(session, turn).entries()) {
      db.run(`INSERT INTO messages(session_id, id, turn_sequence, ordinal, data) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET ordinal = excluded.ordinal, data = excluded.data`,
      [session.id, message.info.id, sequence, ordinal, JSON.stringify(message)]);
    }
  };
  const save = (session: StoredConversation, turn?: AcpTurn) => db.transaction(() => {
    const { turns: _turns, ...metadata } = session;
    db.run('INSERT INTO sessions(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', [session.id, JSON.stringify({ ...metadata, turns: [] })]);
    if (turn) saveTurn(session, turn);
  });
  return {
    save,
    sessions: (): StoredConversation[] => db.all('SELECT data FROM sessions').map(row => JSON.parse(z.string().parse(row.data))),
    summaries: (id: string): AcpTurn[] => db.all(`SELECT summary FROM turns WHERE sequence IN (
      SELECT MAX(sequence) FROM turns WHERE session_id = ? GROUP BY model_id
    ) ORDER BY sequence`, [id]).map(row => JSON.parse(z.string().parse(row.summary))),
    turn(id: string, turnID: string): AcpTurn | undefined {
      const row = db.get('SELECT data FROM turns WHERE session_id = ? AND id = ?', [id, turnID]);
      return row ? JSON.parse(z.string().parse(row.data)) : undefined;
    },
    message(id: string, messageID: string): MessageRecord | undefined {
      const row = db.get('SELECT data FROM messages WHERE session_id = ? AND id = ?', [id, messageID]);
      return row ? JSON.parse(z.string().parse(row.data)) : undefined;
    },
    messages(id: string, input: MessageListOptions): MessagePage {
      const position = input.cursor ? messageCursor.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString())) : undefined;
      const order = position?.order ?? input.order ?? 'desc';
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      const comparison = order === 'asc' ? '>' : '<';
      const anchor = position ? `AND (turn_sequence, ordinal) ${comparison} (SELECT turn_sequence, ordinal FROM messages WHERE session_id = ? AND id = ?)` : '';
      const limit = input.limit ?? 100;
      const rows = db.all(`SELECT data FROM messages WHERE session_id = ? ${anchor}
        ORDER BY turn_sequence ${direction}, ordinal ${direction} LIMIT ?`,
      [id, ...position ? [id, position.id] : [], limit + 1]);
      const items: MessageRecord[] = rows.slice(0, limit).map(row => JSON.parse(z.string().parse(row.data)));
      const last = items.at(-1);
      return { items, cursor: last && rows.length > items.length ? { next: Buffer.from(JSON.stringify({ id: last.info.id, order, direction: 'next' })).toString('base64url') } : {} };
    },
    rename(from: string, to: string) {
      db.transaction(() => {
        db.run("UPDATE sessions SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", [to, to, from]);
        db.run('UPDATE turns SET session_id = ? WHERE session_id = ?', [to, from]);
        db.run('UPDATE messages SET session_id = ? WHERE session_id = ?', [to, from]);
      });
    },
    remove(id: string) {
      db.transaction(() => {
        db.run('DELETE FROM messages WHERE session_id = ?', [id]);
        db.run('DELETE FROM turns WHERE session_id = ?', [id]);
        db.run('DELETE FROM sessions WHERE id = ?', [id]);
      });
    },
    close: () => db.close(),
  };
}
