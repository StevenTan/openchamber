import { z } from 'zod';
import type { AcpConversation, AcpTurn } from '@openchamber/sdk/agent-backends';
import { acpMessages } from '@openchamber/sdk/conversations/antigravity';
import type { QuestionSessionApi } from '../agent-question/src/runtime.js';
import type { ConversationStorage } from './conversation-storage.js';

export type StoredConversation = AcpConversation & { forms: Array<Parameters<QuestionSessionApi['form']['create']>[0] & { state: { status: 'pending' | 'answered' | 'cancelled'; answer?: Record<string, string> } }> };

const summary = (turn: AcpTurn): AcpTurn => ({ ...turn, text: '', files: [], updates: [], followups: [], toolCalls: [] });

export function createAntigravityStorage(messages: ConversationStorage) {
  const saveTurn = (session: StoredConversation, turn: AcpTurn) => messages.session(session.id, db => db.transaction(() => {
    db.run(`INSERT INTO turns(session_id, id, model_id, summary, data) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, id) DO UPDATE SET summary = excluded.summary, data = excluded.data`,
    [session.id, turn.id, turn.modelID, JSON.stringify(summary(turn)), JSON.stringify(turn)]);
    const sequence = z.number().parse(db.get('SELECT sequence FROM turns WHERE session_id = ? AND id = ?', [session.id, turn.id])?.sequence);
    messages.saveMessages(acpMessages(session, turn), sequence);
  }));
  const save = (session: StoredConversation, turn?: AcpTurn) => {
    const { turns: _turns, ...metadata } = session;
    messages.index.run("INSERT INTO sessions(id, backend_id, data) VALUES (?, 'antigravity', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data", [session.id, JSON.stringify({ ...metadata, turns: [] })]);
    if (turn) saveTurn(session, turn);
  };
  return {
    save,
    sessions: (): StoredConversation[] => messages.index.all("SELECT data FROM sessions WHERE backend_id = 'antigravity'").map(row => JSON.parse(z.string().parse(row.data))),
    summaries: (id: string): AcpTurn[] => (messages.readSession(id, db => db.all(`SELECT summary FROM turns WHERE sequence IN (
      SELECT MAX(sequence) FROM turns WHERE session_id = ? GROUP BY model_id
    ) ORDER BY sequence`, [id])) ?? []).map(row => JSON.parse(z.string().parse(row.summary))),
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
