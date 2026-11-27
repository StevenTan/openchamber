import { z } from 'zod';
import type { AcpConversation, AcpTurn } from '@openchamber/sdk/agent-backends';
import { acpMessages, acpSession } from '@openchamber/sdk/conversations/antigravity';
import type { QuestionSessionApi } from '../agent-question/src/runtime.js';
import type { ConversationStorage } from './conversation-storage.js';

export type StoredConversation = AcpConversation & { forms: Array<Parameters<QuestionSessionApi['form']['create']>[0] & { state: { status: 'pending' | 'answered' | 'cancelled'; answer?: Record<string, string> } }> };

const summary = (turn: AcpTurn): AcpTurn => ({ ...turn, text: '', files: [], updates: [], followups: turn.followups.map(input => ({ ...input, text: '', files: [], inputContext: [] })), toolCalls: [], inputContext: [] });

export function createAntigravityStorage(messages: ConversationStorage) {
  const projectHistory = (id: string) => messages.readSession(id, db => {
    if (db.get('PRAGMA user_version')?.user_version === 1) return;
    db.transaction(() => {
      for (const row of db.iterate("SELECT sequence, data FROM turns WHERE json_array_length(data, '$.followups') > 0")) {
        const turn: AcpTurn = JSON.parse(z.string().parse(row.data));
        const sequence = z.number().parse(row.sequence);
        db.run('DELETE FROM messages WHERE turn_sequence = ?', [sequence]);
        messages.saveMessages(acpMessages({ id }, turn), sequence);
        db.run('UPDATE turns SET summary = ? WHERE sequence = ?', [JSON.stringify(summary(turn)), sequence]);
      }
      db.exec('PRAGMA user_version = 1');
    });
  });
  const metadata = (session: StoredConversation) => {
    const info = messages.catalog.get(session.id);
    if (info) {
      session.title = info.title;
      session.archived = info.time.archived ?? null;
      session.metadata = info.metadata;
    }
    return session;
  };
  const saveTurn = (session: StoredConversation, turn: AcpTurn) => {
    projectHistory(session.id);
    return messages.session(session.id, db => db.transaction(() => {
      db.run(`INSERT INTO turns(session_id, id, model_id, summary, data) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, id) DO UPDATE SET summary = excluded.summary, data = excluded.data`,
      [session.id, turn.id, turn.modelID, JSON.stringify(summary(turn)), JSON.stringify(turn)]);
    }));
  };
  const save = (session: StoredConversation, turn?: AcpTurn) => {
    const { turns: _turns, ...metadata } = session;
    messages.index.run("INSERT INTO sessions(id, backend_id, data) VALUES (?, 'antigravity', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data", [session.id, JSON.stringify({ ...metadata, turns: [] })]);
    const info = messages.catalog.save(acpSession(session), 'antigravity', session.nativeID, session.draft);
    session.title = info.title;
    session.archived = info.time.archived ?? null;
    session.metadata = info.metadata;
    if (turn) saveTurn(session, turn);
  };
  return {
    save,
    metadata,
    sessions: (): StoredConversation[] => messages.index.all("SELECT data FROM sessions WHERE backend_id = 'antigravity'").map(row => metadata(JSON.parse(z.string().parse(row.data)))),
    summaries: (id: string): AcpTurn[] => {
      projectHistory(id);
      return (messages.readSession(id, db => db.all(`SELECT summary FROM turns WHERE sequence IN (
      SELECT MAX(sequence) FROM turns WHERE session_id = ? GROUP BY model_id
    ) ORDER BY sequence`, [id])) ?? []).map(row => JSON.parse(z.string().parse(row.summary)));
    },
    turn(id: string, turnID: string): AcpTurn | undefined {
      const row = messages.readSession(id, db => db.get('SELECT data FROM turns WHERE session_id = ? AND id = ?', [id, turnID]));
      return row ? JSON.parse(z.string().parse(row.data)) : undefined;
    },
    message: messages.message,
    messages: messages.messages,
    rename: messages.rename,
    remove: messages.remove,
  };
}
