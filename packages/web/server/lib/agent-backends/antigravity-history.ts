import { z } from 'zod';
import type { SqliteConnection } from '../message-search/sqlite.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { parseProto } from './vendor/protobuf.js';
import type { AcpTurn } from '@openchamber/sdk/agent-backends';

export function rewindAntigravityHistory(db: SqliteConnection, nativePath: string, messageID: string) {
  const row = z.object({ sequence: z.number(), data: z.string() }).parse(db.get(`SELECT sequence, data FROM turns WHERE id = ? OR EXISTS
    (SELECT 1 FROM json_each(turns.data, '$.followups') WHERE json_extract(value, '$.id') = ?)
    OR EXISTS (SELECT 1 FROM json_each(turns.data, '$.inputContext') WHERE json_extract(value, '$.id') = ?)`, [messageID, messageID, messageID]));
  const turn: AcpTurn = JSON.parse(row.data);
  const followup = turn.followups.find(input => input.id === messageID || input.inputContext?.some(item => item.id === messageID));
  const cutoff = (followup ?? turn).inputContext?.[0]?.id ?? messageID;
  const boundary = z.object({ turn_sequence: z.number(), ordinal: z.number() }).parse(db.get('SELECT turn_sequence, ordinal FROM messages WHERE id = ?', [cutoff]));
  const { count } = z.object({ count: z.number() }).parse(db.get("SELECT COALESCE(SUM(1 + json_array_length(data, '$.followups')), 0) AS count FROM turns WHERE sequence < ?", [row.sequence]));
  const inputIndex = count + (followup ? turn.followups.indexOf(followup) + 1 : 0);
  db.run('ATTACH DATABASE ? AS native_history', [nativePath]);
  try {
    db.transaction(() => {
      const step = db.get('SELECT idx, metadata FROM native_history.steps WHERE step_type = 14 ORDER BY idx LIMIT 1 OFFSET ?', [inputIndex]);
      if (!step) throw new OpenChamberControlError('Native history boundary not found', 409);
      const index = z.number().parse(step.idx);
      const metadata = parseProto(z.instanceof(Uint8Array).parse(step.metadata));
      const position = parseProto(z.instanceof(Uint8Array).parse(metadata.get(20)));
      const generation = z.number().parse(position.get(3) ?? 0);
      db.run('DELETE FROM native_history.steps WHERE idx >= ?', [index]);
      db.run('DELETE FROM native_history.gen_metadata WHERE idx >= ?', [generation]);
      db.run('DELETE FROM native_history.executor_metadata WHERE idx >= ?', [generation]);
      db.run('DELETE FROM messages WHERE (turn_sequence, ordinal) >= (?, ?)', [boundary.turn_sequence, boundary.ordinal]);
      if (!followup) db.run('DELETE FROM turns WHERE sequence >= ?', [row.sequence]);
      else {
        const followupIndex = turn.followups.indexOf(followup);
        turn.followups = turn.followups.slice(0, followupIndex);
        turn.updates = turn.updates.slice(0, z.number().parse(followup.updateIndex));
        if (turn.toolCalls) turn.toolCalls = turn.toolCalls.slice(0, z.number().parse(followup.toolCallCount));
        turn.completed = followup.created;
        delete turn.error;
        delete turn.tokens;
        delete turn.context;
        const summary = { ...turn, text: '', files: [], updates: [], followups: turn.followups.map(input => ({ ...input, text: '', files: [], inputContext: [] })), toolCalls: [], inputContext: [] };
        db.run('DELETE FROM turns WHERE sequence > ?', [row.sequence]);
        db.run('UPDATE turns SET data = ?, summary = ? WHERE sequence = ?', [JSON.stringify(turn), JSON.stringify(summary), row.sequence]);

      }
    });
  } finally {
    db.exec('DETACH DATABASE native_history');
  }
  return { messageID: cutoff, turn: followup ? turn : undefined };
}
