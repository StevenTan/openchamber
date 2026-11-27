import type { SyncEvent } from '@openchamber/sdk/conversations/events';
import { syncEventMessageID, syncEventSessionID } from '@openchamber/sdk/conversations/events';
import { applyMessagePatch, applyToolTransition } from '@openchamber/sdk/conversations/message-updates';
import type { ConversationStorage } from './conversation-storage.js';

export function recordHistoryEvent(store: ConversationStorage, event: SyncEvent) {
  const sessionID = syncEventSessionID(event);
  if (!sessionID) return;
  if (event.type === 'session.deleted') {
    store.remove(sessionID);
    return;
  }
  return store.session(sessionID, db => {
    if (event.type === 'session.revert.committed') {
      db.run(`DELETE FROM messages WHERE session_id = ? AND (turn_sequence, ordinal) >=
        (SELECT turn_sequence, ordinal FROM messages WHERE session_id = ? AND id = ?)`, [sessionID, sessionID, event.properties.to]);
      return;
    }
    if (event.type === 'message.compaction.delta') {
      const row = db.get(`SELECT id FROM messages WHERE session_id = ? AND json_extract(data, '$.info.role') = 'compaction'
        ORDER BY turn_sequence DESC, ordinal DESC LIMIT 1`, [sessionID]);
      const record = row && store.message(sessionID, String(row.id));
      if (record?.info.role === 'compaction' && record.info.status === 'running') {
        record.info.summary += event.properties.delta;
        store.saveMessages([record]);
      }
      return record?.info.id;
    }
    let messageID = syncEventMessageID(event);
    if (!messageID) return;
    if (event.type === 'message.patched' && event.properties.patch.shell) {
      const row = db.get("SELECT id FROM messages WHERE session_id = ? AND json_extract(data, '$.info.shellID') = ?", [sessionID, messageID.slice('shell:'.length)]);
      if (!row) return;
      messageID = String(row.id);
    }
    if (event.type === 'message.removed') {
      db.run('DELETE FROM messages WHERE session_id = ? AND id = ?', [sessionID, messageID]);
      return messageID;
    }
    const record = store.message(sessionID, messageID);
    if (event.type === 'message.updated') {
      let info = event.properties.info;
      if (info.role === 'compaction' && info.status !== 'running') {
        const row = db.get(`SELECT id FROM messages WHERE session_id = ? AND json_extract(data, '$.info.role') = 'compaction'
          ORDER BY turn_sequence DESC, ordinal DESC LIMIT 1`, [sessionID]);
        const running = row && store.message(sessionID, String(row.id));
        if (running?.info.role === 'compaction' && running.info.status === 'running') info = { ...info, id: running.info.id, time: running.info.time };
      }
      if (record && record.info.time.created !== info.time.created) db.run('DELETE FROM messages WHERE session_id = ? AND id = ?', [sessionID, messageID]);
      store.saveMessages([{ info, parts: record?.parts ?? [] }]);
      return info.id;
    }
    if (!record) return;
    switch (event.type) {
      case 'message.patched': {
        const created = record.info.time.created;
        record.info = applyMessagePatch(record.info, event.properties.patch);
        if (created !== record.info.time.created) db.run(`UPDATE messages SET turn_sequence =
          (SELECT COALESCE(MAX(turn_sequence), 0) + 1 FROM messages WHERE session_id = ?) WHERE session_id = ? AND id = ?`, [sessionID, sessionID, messageID]);
        break;
      }
      case 'message.parts.replaced':
        record.parts = event.properties.parts;
        break;
      case 'message.part.updated': {
        const part = event.properties.part;
        const index = record.parts.findIndex(item => item.id === part.id);
        if (index === -1) record.parts.push(part);
        else record.parts[index] = part;
        break;
      }
      case 'message.part.delta': {
        const part = record.parts.find(item => item.id === event.properties.partID);
        if (part?.type === 'text' || part?.type === 'reasoning') part.text += event.properties.delta;
        else if (part?.type === 'tool' && part.state.status === 'pending' && event.properties.field === 'raw') part.state.raw += event.properties.delta;
        break;
      }
      case 'message.tool.transition': {
        const index = record.parts.findIndex(part => part.id === event.properties.partID);
        const part = record.parts[index];
        if (part?.type === 'tool') record.parts[index] = applyToolTransition(part, event.properties.transition);
        break;
      }
      default:
        return;
    }
    store.saveMessages([record]);
    return record.info.id;
  });
}
