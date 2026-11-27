import type { AcpConversationEvent } from '@openchamber/sdk/agent-backends';
import { acpMessages, acpSession } from '@openchamber/sdk/conversations/antigravity';
import type { SyncEvent } from '@openchamber/sdk/conversations/events';

export function antigravityEvents(event: Exclude<AcpConversationEvent, { type: 'control' | 'deleted' }>): SyncEvent[] {
  const { session } = event;
  if (event.type === 'reverted') return [
    { type: 'session.revert.committed', properties: { sessionID: session.id, to: event.messageID } },
    { type: 'session.patched', properties: { sessionID: session.id, patch: { revert: null } } },
  ];
  if (event.type === 'session') {
    const info = acpSession(session);
    return [event.created ? { type: 'session.created', properties: { info } } : {
      type: 'session.patched', properties: { sessionID: info.id, patch: { title: info.title, ...info.model && { model: info.model }, time: { ...info.time, archived: session.archived ?? null }, tokens: info.tokens, ...info.metadata && { metadata: info.metadata }, revert: session.revert ?? null } },
    }];
  }
  const { turn } = event;
  const events: SyncEvent[] = acpMessages(session, turn).flatMap(message => [
    { type: 'message.updated', properties: { info: message.info } },
    ...message.parts.map(part => ({ type: 'message.part.updated' as const, properties: { sessionID: session.id, part } })),
  ]);
  events.push({ type: 'session.status', properties: { sessionID: session.id, status: { type: turn.completed ? 'idle' : 'busy' } } });
  if (turn.completed) events.push({ type: 'session.idle', properties: { sessionID: session.id } });
  return events;
}
