import { z } from 'zod';

export const backendSessionId = z.string().regex(/^ses_acp_[A-Za-z0-9]+$/);
const jsonRecord = z.record(z.string(), z.json());
export const backendPart = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.enum(['text', 'reasoning']), text: z.string(), startedAt: z.number(), endedAt: z.number().nullable() }),
  z.object({ id: z.string(), type: z.literal('tool'), callId: z.string(), name: z.string(), title: z.string(), status: z.enum(['pending', 'in_progress', 'completed', 'failed']), input: jsonRecord, output: z.string(), files: z.array(z.object({ path: z.string(), oldText: z.string().nullable(), newText: z.string() })), startedAt: z.number(), endedAt: z.number().nullable() }),
]);
export const backendMessage = z.object({
  id: z.string(), role: z.enum(['user', 'assistant']), createdAt: z.number(), completedAt: z.number().nullable(),
  parts: z.array(backendPart), error: z.string().nullable(),
});
export const backendSession = z.object({
  id: backendSessionId, backend: z.literal('antigravity'), nativeId: z.string(), directory: z.string(), title: z.string(),
  createdAt: z.number(), updatedAt: z.number(), archivedAt: z.number().nullable(), metadata: jsonRecord,
  messages: z.array(backendMessage),
});
export const backendForm = z.object({
  id: z.string(), sessionID: backendSessionId, title: z.string(),
  fields: z.tuple([z.object({ key: z.literal('decision'), type: z.literal('string'), required: z.literal(true), options: z.array(z.object({ value: z.string(), label: z.string() })) })]),
});
export type BackendSession = z.infer<typeof backendSession>;
export type BackendMessage = z.infer<typeof backendMessage>;
export type BackendPart = z.infer<typeof backendPart>;
export type BackendForm = z.infer<typeof backendForm>;
export type BackendEvent =
  | { kind: 'session'; session: Omit<BackendSession, 'messages'>; created?: boolean }
  | { kind: 'message'; sessionId: string; message: BackendMessage }
  | { kind: 'part'; sessionId: string; messageId: string; part: BackendPart }
  | { kind: 'delta'; sessionId: string; messageId: string; partId: string; delta: string }
  | { kind: 'status'; sessionId: string; status: 'busy' | 'idle'; outcome?: 'succeeded' | 'failed' | 'interrupted' }
  | { kind: 'form'; form: BackendForm }
  | { kind: 'form-settled'; sessionId: string; formId: string }
  | { kind: 'deleted'; sessionId: string };

export const createSessionInput = z.object({ id: backendSessionId.optional(), directory: z.string().min(1), title: z.string().optional(), metadata: jsonRecord.optional() });
export const promptInput = z.object({ messageId: z.string().min(1), text: z.string(), context: z.array(z.object({ text: z.string() })).optional() });
export const sessionPatch = z.object({ title: z.string().optional(), archivedAt: z.number().nullable().optional(), metadata: jsonRecord.optional() });
