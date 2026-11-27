import { z } from 'zod';
import type { SqliteConnection } from '../message-search/sqlite.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { parseProto } from './vendor/protobuf.js';
import type { AcpTurn } from '@openchamber/sdk/agent-backends';
import { acpMessages } from '@openchamber/sdk/conversations/antigravity';

export function rewindAntigravityHistory(db: SqliteConnection, nativePath: string, messageID: string) {
  const boundary = z.object({ turn_sequence: z.number(), ordinal: z.number() }).parse(db.get('SELECT turn_sequence, ordinal FROM messages WHERE id = ?', [messageID]));
  const turn: AcpTurn = JSON.parse(z.string().parse(db.get('SELECT data FROM turns WHERE sequence = ?', [boundary.turn_sequence])?.data));
  const followup = turn.followups.find(input => input.id === messageID || input.inputContext?.some(item => item.id === messageID));
  const { count } = z.object({ count: z.number() }).parse(db.get(`SELECT COUNT(*) AS count FROM messages
    WHERE json_extract(data, '$.info.role') = 'user' AND (turn_sequence, ordinal) < (?, ?)`, [boundary.turn_sequence, boundary.ordinal]));
  db.run('ATTACH DATABASE ? AS native_history', [nativePath]);
  try {
    db.transaction(() => {
      const step = db.get('SELECT idx, metadata FROM native_history.steps WHERE step_type = 14 ORDER BY idx LIMIT 1 OFFSET ?', [count]);
      if (!step) throw new OpenChamberControlError('Native history boundary not found', 409);
      const index = z.number().parse(step.idx);
      const metadata = parseProto(z.instanceof(Uint8Array).parse(step.metadata));
      const position = parseProto(z.instanceof(Uint8Array).parse(metadata.get(20)));
      const generation = z.number().parse(position.get(3) ?? 0);
      db.run('DELETE FROM native_history.steps WHERE idx >= ?', [index]);
      db.run('DELETE FROM native_history.gen_metadata WHERE idx >= ?', [generation]);
      db.run('DELETE FROM native_history.executor_metadata WHERE idx >= ?', [generation]);
      db.run('DELETE FROM messages WHERE turn_sequence >= ?', [boundary.turn_sequence]);
      if (!followup) db.run('DELETE FROM turns WHERE sequence >= ?', [boundary.turn_sequence]);
      else {
        const followupIndex = turn.followups.indexOf(followup);
        turn.followups = turn.followups.slice(0, followupIndex);
        turn.updates = turn.updates.slice(0, z.number().parse(followup.updateIndex));
        if (turn.toolCalls) turn.toolCalls = turn.toolCalls.slice(0, z.number().parse(followup.toolCallCount));
        turn.completed = followup.created;
        delete turn.error;
        delete turn.tokens;
        delete turn.context;
        const summary = { ...turn, text: '', files: [], updates: [], followups: [], toolCalls: [], inputContext: [] };
        db.run('DELETE FROM turns WHERE sequence > ?', [boundary.turn_sequence]);
        db.run('UPDATE turns SET data = ?, summary = ? WHERE sequence = ?', [JSON.stringify(turn), JSON.stringify(summary), boundary.turn_sequence]);
        const owner = z.string().parse(db.get('SELECT session_id FROM turns WHERE sequence = ?', [boundary.turn_sequence])?.session_id);
        for (const [ordinal, record] of acpMessages({ id: owner }, turn).entries()) {
          db.run('INSERT INTO messages(session_id, id, turn_sequence, ordinal, data) VALUES (?, ?, ?, ?, ?)', [owner, record.info.id, boundary.turn_sequence, ordinal, JSON.stringify(record)]);
        }
      }
    });
  } finally {
    db.exec('DETACH DATABASE native_history');
  }
  return { messageID: (followup ?? turn).inputContext?.[0]?.id ?? messageID, turn: followup ? turn : undefined };
}
