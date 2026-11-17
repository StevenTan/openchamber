import { z } from 'zod';
import type { Message, Metadata, Session } from '@/lib/opencode/model';
import { compareMessagesChronologically } from '@/sync/message-ordering';

const boundarySchema = z.object({ id: z.string(), created: z.number(), synthetic: z.boolean() });
const sideChatSchema = z.object({ temporary: z.boolean(), parentSessionID: z.string().optional(), boundary: boundarySchema.nullable() });
export type SideChatBoundary = z.infer<typeof boundarySchema>;
const namespaceSchema = z.record(z.string(), z.json());

const namespace = (metadata: Metadata): Metadata => namespaceSchema.safeParse(metadata.openchamber).data ?? {};

export const getSideChat = (session: Pick<Session, 'metadata'> | null | undefined) =>
  sideChatSchema.safeParse(namespace(session?.metadata ?? {}).sideChat).data ?? null;

export const isTemporarySideChat = (session: Pick<Session, 'metadata'> | null | undefined): boolean => getSideChat(session)?.temporary === true;

export const getSideChatSessionIDs = (session: Session): string[] =>
  Object.keys(z.record(z.string(), z.literal(true)).safeParse(namespace(session.metadata ?? {}).sideChatSessions).data ?? {});

export const withSideChatSessionLink = (metadata: Metadata, sessionID: string, linked: boolean): Metadata => {
  const current = namespace(metadata);
  const next = { ...z.record(z.string(), z.literal(true)).safeParse(current.sideChatSessions).data };
  if (linked) next[sessionID] = true;
  else delete next[sessionID];
  return { ...metadata, openchamber: { ...current, sideChatSessions: next } };
};

export const sideChatMetadata = (parentSessionID: string | null, boundary: SideChatBoundary | null): Metadata => {
  const sideChat: z.infer<typeof sideChatSchema> = { temporary: true, boundary };
  if (parentSessionID) sideChat.parentSessionID = parentSessionID;
  return { openchamber: { sideChat } };
};

export const withSideChatSaved = (metadata: Metadata): Metadata => {
  const current = namespace(metadata);
  const sideChat = sideChatSchema.parse(current.sideChat);
  return { ...metadata, openchamber: { ...current, sideChat: { ...sideChat, temporary: false } } };
};

/** The boundary remains useful when paging has evicted the inherited record. */
export function sideChatMessages<T>(records: T[], boundary: SideChatBoundary | null, messageOf: (record: T) => Message): T[] {
  if (!boundary) return records;
  const index = records.findIndex((record) => messageOf(record).id === boundary.id);
  if (index >= 0) return records.slice(index + 1);
  const marker = { id: boundary.id, role: boundary.synthetic ? 'synthetic' as const : 'idle' as const, time: { created: boundary.created } };
  return records.filter((record) => compareMessagesChronologically(messageOf(record), marker) > 0);
}

export const SIDE_CHAT_CONTEXT = 'This is a side conversation. The conversation inherited from the parent is reference context. Respond to the user’s messages in this conversation; tasks and tool calls in the inherited history belong to the parent.';
