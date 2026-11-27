import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AcpTurn } from '@openchamber/sdk/agent-backends';
import { turnDiffReferenceSchema } from '@openchamber/sdk/agent-backends';
import type { MessageRecord } from '@openchamber/sdk/conversations/http';
import type { ConversationStorage } from './conversation-storage.js';
import { createMessageId } from '../dispatch-results/runtime.js';
import { rewindAntigravityHistory } from './antigravity-history.js';

export function copyAntigravityDatabase(from: string, to: string, nativeID: string) {
  const source = new DatabaseSync(from, { readOnly: true });
  try { source.prepare('VACUUM INTO ?').run(to); } finally { source.close(); }
  const db = new DatabaseSync(to);
  try {
    const identity = z.object({ trajectory_id: z.string(), cascade_id: z.string() }).parse(db.prepare('SELECT trajectory_id, cascade_id FROM trajectory_meta').get());
    const trajectoryID = randomUUID();
    const replace = (value: Uint8Array) => Buffer.from(Buffer.from(value).toString('latin1').replaceAll(identity.trajectory_id, trajectoryID).replaceAll(identity.cascade_id, nativeID), 'latin1');
    db.prepare('UPDATE trajectory_meta SET trajectory_id = ?, cascade_id = ?').run(trajectoryID, nativeID);
    for (const [table, columns] of [
      ['steps', ['metadata', 'step_payload']],
      ['gen_metadata', ['data']],
      ['executor_metadata', ['data']],
      ['parent_references', ['data']],
      ['trajectory_metadata_blob', ['data']],
      ['battle_mode_infos', ['data']],
    ] as const) {
      for (const column of columns) {
        const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
        for (const row of db.prepare(`SELECT rowid AS row_id, ${column} AS data FROM ${table} WHERE ${column} IS NOT NULL`).iterate()) {
          update.run(replace(z.instanceof(Uint8Array).parse(row.data)), z.number().parse(row.row_id));
        }
      }
    }
  } finally { db.close(); }
}

export function copyAntigravityHistory(storage: ConversationStorage, from: string, to: string, nativePath: string, before?: string) {
  storage.copy(from, to);
  storage.session(to, db => {
    if (before) rewindAntigravityHistory(db, nativePath, before);
    const ids = new Map<string, string>();
    let timestamp = 0;
    for (const row of db.iterate('SELECT id, data FROM messages ORDER BY turn_sequence, ordinal')) {
      const record: MessageRecord = JSON.parse(z.string().parse(row.data));
      timestamp = Math.max(timestamp + 1, record.info.time.created);
      ids.set(z.string().parse(row.id), createMessageId(timestamp));
    }
    const remap = (id: string) => z.string().parse(ids.get(id));
    for (const row of db.iterate('SELECT data FROM turns ORDER BY sequence')) {
      const turn: AcpTurn = JSON.parse(z.string().parse(row.data));
      for (const input of turn.followups) ids.set(`${input.id}_assistant`, `${remap(input.id)}_assistant`);
    }
    db.transaction(() => {
      db.run('DELETE FROM turn_diffs WHERE turn_id NOT IN (SELECT id FROM turns)');
      for (const row of db.iterate('SELECT id, sequence, data FROM turns ORDER BY sequence')) {
        const turn: AcpTurn = JSON.parse(z.string().parse(row.data));
        const originalID = turn.id;
        turn.id = remap(turn.id);
        turn.assistantID = remap(turn.assistantID);
        turn.inputContext = turn.inputContext?.map(item => ({ ...item, id: remap(z.string().parse(item.id)) }));
        turn.followups = turn.followups.map(item => ({ ...item, id: remap(item.id), inputContext: item.inputContext?.map(context => ({ ...context, id: remap(z.string().parse(context.id)) })) }));
        if (turn.fileDiff) turn.fileDiff = { ...turn.fileDiff, turnID: turn.id };
        const summary = { ...turn, text: '', files: [], updates: [], followups: turn.followups.map(input => ({ ...input, text: '', files: [], inputContext: [] })), toolCalls: [], inputContext: [] };
        db.run('UPDATE turns SET session_id = ?, id = ?, summary = ?, data = ? WHERE id = ?', [to, turn.id, JSON.stringify(summary), JSON.stringify(turn), originalID]);
        const diff = storage.diff(to, originalID);
        if (diff) {
          db.run('DELETE FROM turn_diffs WHERE turn_id = ?', [originalID]);
          storage.saveDiff({ ...diff, sessionID: to, turnID: turn.id });
        }
      }
      const records = db.all('SELECT id, data FROM messages ORDER BY turn_sequence, ordinal');
      db.run('DELETE FROM messages');
      for (const row of records) {
        const record: MessageRecord = JSON.parse(z.string().parse(row.data));
        const messageID = remap(record.info.id);
        record.info = { ...record.info, id: messageID, sessionID: to };
        record.parts = record.parts.map(part => {
          const base = { ...part, id: `${messageID}_${part.id}`, messageID, sessionID: to };
          if (base.type !== 'tool' || base.state.status === 'pending') return base;
          const metadata = { ...base.state.metadata };
          if (metadata.openchamberTurnDiff) {
            const reference = turnDiffReferenceSchema.parse(metadata.openchamberTurnDiff);
            metadata.openchamberTurnDiff = z.record(z.string(), z.json()).parse({ ...reference, ...reference.turnID && { turnID: remap(reference.turnID) } });
          }
          return { ...base, state: { ...base.state, metadata: z.record(z.string(), z.json()).parse(metadata), ...base.state.status === 'completed' && base.state.attachments && { attachments: base.state.attachments.map(file => ({ ...file, id: `${messageID}_${file.id}`, sessionID: to, messageID })) } } };
        });
        storage.saveMessages([record]);
      }
    });
  });
}
