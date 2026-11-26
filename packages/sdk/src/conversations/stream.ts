import { z } from 'zod';
import type { ClassifiedStreamPayload } from './stream-payload.js';
import type { SpaceCreationStep } from './space-events.js';

export const CONVERSATION_EVENTS_PATH = '/api/conversations/events';
export const CONVERSATION_EVENTS_WS_PATH = '/api/conversations/events/ws';
export type SpaceProgress = { spaceId: string; step: SpaceCreationStep | 'failed' | 'removed'; failure: { code: string; message: string } | null };

const payloadSchema = z.object({ kind: z.enum(['events', 'space-stream', 'space-progress', 'space-task-title', 'space-setup', 'space-permission-stream']) });
export type ConversationStreamPayload = ClassifiedStreamPayload & { hostNow: number };
const envelopeSchema = z.object({ type: z.literal('openchamber:conversation'), properties: payloadSchema });

export function conversationPayload(value: unknown): ClassifiedStreamPayload {
  payloadSchema.parse(value);
  // SAFETY: the authenticated host serializes the shared ClassifiedStreamPayload contract.
  return value as ClassifiedStreamPayload;
}

export function injectedConversationPayload(value: unknown): ClassifiedStreamPayload | undefined {
  if (!envelopeSchema.safeParse(value).success) return undefined;
  // SAFETY: host adapters inject this envelope with the shared conversation event contract.
  return (value as { properties: ClassifiedStreamPayload }).properties;
}
