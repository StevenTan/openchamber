import { z } from 'zod';
import { acpMessages } from '@openchamber/sdk/conversations/antigravity';
import { createAntigravityStorage } from './antigravity-storage.js';
import type { ConversationStorage } from './conversation-storage.js';

export function createAntigravityHistoryFixture(storage: ConversationStorage) {
  const history = createAntigravityStorage(storage);
  return { ...history, save(...[session, turn]: Parameters<typeof history.save>) {
    history.save(session, turn);
    if (turn) storage.session(session.id, db => {
      const sequence = z.number().parse(db.get('SELECT sequence FROM turns WHERE id = ?', [turn.id])?.sequence);
      storage.saveMessages(acpMessages(session, turn), sequence);
    });
  } };
}
