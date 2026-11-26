import type { SyncEvent } from '@openchamber/sdk/conversations/events';
import { syncEventSessionID, syncEventMessageID } from '@openchamber/sdk/conversations/events';
import type { MessageListOptions, MessagePage } from '@openchamber/sdk/conversations/http';
import type { MessageRecord } from '@openchamber/sdk/conversations/http';
import type { ConversationStorage } from './conversation-storage.js';
import { recordHistoryEvent } from './conversation-history-events.js';

export function createOpenCodeHistory(store: ConversationStorage) {
  const complete = new Set<string>();
  const importing = new Map<string, Map<string, MessageRecord | undefined>>();
  const record = (event: SyncEvent) => {
    const id = syncEventSessionID(event);
    if (!id) return;
    const messageID = recordHistoryEvent(store, event) ?? syncEventMessageID(event);
    if (messageID) importing.get(id)?.set(messageID, store.message(id, messageID));
    if (event.type === 'session.deleted') complete.delete(id);
  };
  return {
    record,
    async importSession(id: string, read: (input: MessageListOptions) => Promise<MessagePage>) {
      if (complete.has(id)) return;
      const updates = new Map<string, MessageRecord | undefined>();
      const imported = new Set<string>();
      importing.set(id, updates);
      try {
        let cursor: string | undefined;
        let sequence = 0;
        do {
          const page = await read({ limit: 100, order: 'asc', cursor });
          store.session(id, db => db.transaction(() => {
            if (!cursor) store.clearMessages(id);
            for (const message of page.items) {
              imported.add(message.info.id);
              store.saveMessages([updates.get(message.info.id) ?? message], ++sequence);
            }
          }));
          cursor = page.cursor.next;
        } while (cursor);
        store.session(id, db => db.transaction(() => {
          for (const [messageID, message] of updates) {
            if (message) store.saveMessages([message], imported.has(messageID) ? undefined : ++sequence);
            else db.run('DELETE FROM messages WHERE session_id = ? AND id = ?', [id, messageID]);
          }
        }));
        complete.add(id);
      } finally {
        importing.delete(id);
      }
    },
    messages: store.messages,
    message: store.message,
    reset: () => complete.clear(),
    remove(id: string) {
      store.remove(id);
      complete.delete(id);
    },
    close: store.close,
  };
}
export type OpenCodeHistory = ReturnType<typeof createOpenCodeHistory>;
