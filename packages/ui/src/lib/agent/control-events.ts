import type { AcpConversationEvent } from '@openchamber/sdk/agent-backends';

export type AgentBackendEvent = { type: 'agent-backend'; payload: AcpConversationEvent };

export function dispatchBackendEvent(envelope: { type: string; properties: unknown }, listeners: Iterable<(event: AgentBackendEvent) => void>) {
  if (envelope.type !== 'openchamber:acp') return false;
  // SAFETY: the host publishes this envelope with its SDK-validated ACP conversation event.
  const payload = envelope.properties as AcpConversationEvent;
  for (const listener of listeners) listener({ type: 'agent-backend', payload });
  return true;
}
