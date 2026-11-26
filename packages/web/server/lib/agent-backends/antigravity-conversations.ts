import { acpSession, acpMessages, acpCatalog } from '@openchamber/sdk/conversations/antigravity';
import type { ConversationApi } from './conversation-contract.js';
import type { createAntigravityBackend } from './antigravity.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import os from 'node:os';

export function createAntigravityConversations(backend: ReturnType<typeof createAntigravityBackend>, directory?: string): ConversationApi {
  const history = async (id: string) => { const session = await backend.get(id); return session.turns.flatMap(turn => acpMessages(session, turn)); };
  return {
    async create(input) {
      const session = await backend.create(directory ?? os.homedir(), input.title, input.id);
      if (input.model) await backend.model(session.id, input.model.id, input.model.variant);
      return acpSession(await backend.get(session.id));
    },
    list: async input => ({ sessions: input.cursor ? [] : (await backend.list(input.global ? undefined : directory)).map(acpSession).filter(session => !input.parentID && (!input.search || session.title.includes(input.search))), cursor: {} }),
    get: async id => acpSession(await backend.get(id)),
    remove: id => backend.remove(id),
    rename: (id, title) => backend.rename(id, title),
    messages: async id => ({ items: (await history(id)).reverse(), cursor: {} }),
    async message(id, messageID) {
      const message = (await history(id)).find(item => item.info.id === messageID);
      if (!message) throw new OpenChamberControlError('Message not found', 404);
      return message;
    },
    inbox: async () => [],
    model: (id, model) => backend.model(id, model.id, model.variant),
    agent: async (_id, agent) => { if (agent !== 'antigravity') throw new OpenChamberControlError(`Unsupported Antigravity agent: ${agent}`, 400); },
    context: async (_id, input) => [input],
    skills: async names => ({ attached: [], unresolved: [...names] }),
    prompt: (id, input) => backend.send(id, input),
    interrupt: id => backend.abort(id),
    catalog: async sessionID => acpCatalog(await (sessionID ? backend.get(sessionID) : backend.prepare(directory ?? os.homedir()))),
    providers: async () => [{ id: 'antigravity', name: 'Antigravity', activation: 'enabled', package: 'antigravity' }],
    agents: async () => [{ id: 'antigravity', name: 'antigravity', displayName: 'Antigravity', request: { settings: {}, headers: {}, body: {} }, mode: 'primary', hidden: false, permissions: [] }],
  };
}
