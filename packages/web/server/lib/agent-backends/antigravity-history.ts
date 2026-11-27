import { z } from 'zod';
import type { SqliteConnection } from '../message-search/sqlite.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { parseProto } from './vendor/protobuf.js';

export function rewindAntigravityHistory(db: SqliteConnection, nativePath: string, messageID: string) {
  const boundary = z.object({ turn_sequence: z.number(), ordinal: z.number() }).parse(db.get('SELECT turn_sequence, ordinal FROM messages WHERE id = ?', [messageID]));
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
      db.run('DELETE FROM messages WHERE (turn_sequence, ordinal) >= (?, ?)', [boundary.turn_sequence, boundary.ordinal]);
      db.run('DELETE FROM turns WHERE sequence >= ?', [boundary.turn_sequence]);
    });
  } finally {
    db.exec('DETACH DATABASE native_history');
  }
}
