import { CONVERSATION_EVENTS_PATH, CONVERSATION_EVENTS_WS_PATH, conversationPayload, type ConversationStreamPayload } from '@openchamber/sdk/conversations/stream';
import { runtimeFetch } from '../runtime-fetch';
import { getRuntimeUrlResolver } from '../runtime-url';
import { openRuntimeWebSocket } from '../relay/runtime-socket';
import { createEventPipeline, type EventTransport } from './event-pipeline';
import type { AgentEventSource } from './event-source';

async function* subscribe({ signal, onActivity, lastEventId }: Parameters<EventTransport['subscribe']>[0]) {
  const response = await runtimeFetch(CONVERSATION_EVENTS_PATH, { signal, query: lastEventId ? { lastEventId } : {} });
  if (!response.ok) throw Object.assign(new Error(`Conversation stream failed (${response.status})`), { status: response.status });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      onActivity();
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (block.startsWith('data: ')) yield JSON.parse(block.slice(6));
      }
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export function createConversationEventSource(): AgentEventSource {
  const source: EventTransport = {
    subscribe,
    openSocket: lastEventId => openRuntimeWebSocket(getRuntimeUrlResolver().websocket(CONVERSATION_EVENTS_WS_PATH, lastEventId ? { lastEventId } : undefined)),
    classify(payload) {
      const result = conversationPayload(payload);
      if (result.kind === 'events') {
        // SAFETY: the host attaches its timestamp to every normalized stream payload.
        const { hostNow } = payload as ConversationStreamPayload;
        for (const { event } of result.events) {
          if (event.type === 'session.status' && event.properties.turnStart) {
            event.properties.turnStart.at = Date.now() - Math.max(0, hostNow - event.properties.turnStart.at);
          }
        }
      }
      return result;
    },
  };
  return { identity: source, connect: input => createEventPipeline({ ...input, source }) };
}
