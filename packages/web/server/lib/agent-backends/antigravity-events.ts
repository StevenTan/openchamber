import type { AcpConversationEvent } from '@openchamber/sdk/agent-backends';
import { acpSession } from '@openchamber/sdk/conversations/antigravity';
import type { SyncEvent } from '@openchamber/sdk/conversations/events';
import type { MessageRecord } from '@openchamber/sdk/conversations/http';
import type { SessionNotification } from '@agentclientprotocol/sdk';

export function antigravityChunk(message: MessageRecord, update: SessionNotification['update']): SyncEvent[] {
  if ((update.sessionUpdate !== 'agent_message_chunk' && update.sessionUpdate !== 'agent_thought_chunk') || update.content.type !== 'text') return [];
  const type = update.sessionUpdate === 'agent_message_chunk' ? 'text' : 'reasoning';
  const { sessionID, id: messageID } = message.info;
  const last = message.parts.at(-1);
  if (last?.type === type) return [{ type: 'message.part.delta', properties: { sessionID, messageID, partID: last.id, field: 'text', delta: update.content.text } }];
  return [{ type: 'message.part.updated', properties: { sessionID, part: { id: `${messageID}_${message.parts.length}`, sessionID, messageID, type, text: update.content.text, time: { start: Date.now() } } } }];
}

export function antigravityEvents(event: Exclude<AcpConversationEvent, { type: 'control' | 'deleted' }>): SyncEvent[] {
  const { session } = event;
  if (event.type === 'forked') return [
    { type: 'session.created', properties: { info: acpSession(session) } },
    { type: 'session.forked', properties: { sessionID: session.id, parentID: event.parentID } },
  ];
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
  return [];
}
