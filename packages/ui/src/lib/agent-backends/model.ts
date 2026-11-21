import { z } from 'zod';
import type { Message, Metadata, ModelSelection, Part, Session, TextPart, ToolPart } from '../opencode/model';
import type { SyncEvent } from '../opencode/events';

export type AgentBackendId = 'opencode' | 'antigravity';
export const isAcpSession = (id: string) => id.startsWith('ses_acp_');

export interface AgentBackendAdapter {
  createSession(params?: { id?: string; title?: string; metadata?: Metadata; model?: ModelSelection; agent?: string; backend?: AgentBackendId }, directory?: string | null): Promise<Session>;
  getSession(id: string, directory?: string | null, signal?: AbortSignal): Promise<Session>;
  getSessionMessages(id: string, options?: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; partShells?: boolean }, directory?: string | null): Promise<{ items: Array<{ info: Message; parts: Part[] }>; cursor: { previous?: string; next?: string } }>;
  sendMessage(params: { id: string; providerID: string; text: string; messageId?: string; context?: Array<{ text: string }>; beforeSend?: () => void }): Promise<string>;
  abortSession(id: string, directory?: string | null): Promise<boolean>;
}

const textPart = z.object({ id: z.string(), type: z.enum(['text', 'reasoning']), text: z.string(), startedAt: z.number(), endedAt: z.number().nullable() });
const toolPart = z.object({
  id: z.string(), type: z.literal('tool'), callId: z.string(), name: z.string(), title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']), input: z.record(z.string(), z.json()), output: z.string(),
  files: z.array(z.object({ path: z.string(), oldText: z.string().nullable(), newText: z.string() })), startedAt: z.number(), endedAt: z.number().nullable(),
});
export const backendPartSchema = z.discriminatedUnion('type', [textPart, toolPart]);
export const backendMessageSchema = z.object({ id: z.string(), role: z.enum(['user', 'assistant']), createdAt: z.number(), completedAt: z.number().nullable(), parts: z.array(backendPartSchema), error: z.string().nullable() });
export const backendSessionSchema = z.object({
  id: z.string(), backend: z.literal('antigravity'), nativeId: z.string(), directory: z.string(), title: z.string(),
  createdAt: z.number(), updatedAt: z.number(), archivedAt: z.number().nullable(), metadata: z.record(z.string(), z.json()),
});
const backendFormSchema = z.object({ id: z.string(), sessionID: z.string(), title: z.string(), fields: z.tuple([z.object({ key: z.literal('decision'), type: z.literal('string'), required: z.literal(true), options: z.array(z.object({ value: z.string(), label: z.string() })) })]) });
export const backendSnapshotSchema = z.object({ sessions: z.array(backendSessionSchema), statuses: z.record(z.string(), z.object({ type: z.literal('busy') })), forms: z.array(backendFormSchema) });
export const backendEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), session: backendSessionSchema, created: z.boolean().optional() }),
  z.object({ kind: z.literal('message'), sessionId: z.string(), message: backendMessageSchema }),
  z.object({ kind: z.literal('part'), sessionId: z.string(), messageId: z.string(), part: backendPartSchema }),
  z.object({ kind: z.literal('delta'), sessionId: z.string(), messageId: z.string(), partId: z.string(), delta: z.string() }),
  z.object({ kind: z.literal('status'), sessionId: z.string(), status: z.enum(['busy', 'idle']), outcome: z.enum(['succeeded', 'failed', 'interrupted']).optional() }),
  z.object({ kind: z.literal('form'), form: backendFormSchema }),
  z.object({ kind: z.literal('form-settled'), sessionId: z.string(), formId: z.string() }),
  z.object({ kind: z.literal('deleted'), sessionId: z.string() }),
]);
export type BackendEvent = z.infer<typeof backendEventSchema>;

export function projectBackendSession(value: z.infer<typeof backendSessionSchema>): Session {
  const session: Session = {
    id: value.id, directory: value.directory, projectID: value.directory, title: value.title,
    agent: 'Antigravity', model: { providerID: 'antigravity', id: 'Antigravity' }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    metadata: { ...value.metadata, agentBackend: value.backend }, time: { created: value.createdAt, updated: value.updatedAt },
  };
  if (value.archivedAt !== null) session.time.archived = value.archivedAt;
  return session;
}

export function projectBackendMessage(sessionID: string, message: z.infer<typeof backendMessageSchema>): Message {
  if (message.role === 'user') return { id: message.id, sessionID, role: 'user', time: { created: message.createdAt } };
  const result: Message = { id: message.id, sessionID, role: 'assistant', agent: 'Antigravity', providerID: 'antigravity', modelID: 'Antigravity', time: { created: message.createdAt } };
  if (message.completedAt !== null) result.time.completed = message.completedAt;
  if (message.error) result.error = { type: 'agent', message: message.error };
  return result;
}

function fullFilePatch(file: z.infer<typeof toolPart>['files'][number]) {
  const before = file.oldText === null || file.oldText === '' ? [] : file.oldText.replace(/\n$/, '').split('\n');
  const after = file.newText === '' ? [] : file.newText.replace(/\n$/, '').split('\n');
  const lines = [`--- ${file.oldText === null ? '/dev/null' : file.path}`, `+++ ${file.path}`, `@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@`, ...before.map(line => `-${line}`), ...after.map(line => `+${line}`)];
  return lines.join('\n') + '\n';
}

export function projectBackendPart(sessionID: string, messageID: string, part: z.infer<typeof backendPartSchema>): Part {
  const base = { id: part.id, sessionID, messageID };
  if (part.type !== 'tool') {
    const time: NonNullable<TextPart['time']> = { start: part.startedAt };
    if (part.endedAt !== null) time.end = part.endedAt;
    return { ...base, type: part.type, text: part.text, time };
  }
  const metadata = { title: part.title, files: part.files.map(file => ({ file: file.path, filePath: file.path, patch: fullFilePatch(file) })) };
  const tool = part.files.length ? 'patch' : `acp_${part.name}`;
  const result: ToolPart = { ...base, type: 'tool', callID: part.callId, tool, state: { status: 'pending', input: part.input, raw: '' } };
  if (part.status === 'pending' || part.status === 'in_progress') result.state = { status: 'running', input: part.input, metadata, time: { start: part.startedAt } };
  else if (part.status === 'failed') result.state = { status: 'error', input: part.input, error: part.output, metadata, time: { start: part.startedAt, end: part.endedAt ?? part.startedAt } };
  else result.state = { status: 'completed', input: part.input, output: part.output, metadata, time: { start: part.startedAt, end: part.endedAt ?? part.startedAt } };
  return result;
}

export function projectBackendEvent(event: BackendEvent): SyncEvent[] {
  switch (event.kind) {
    case 'session': return event.created
      ? [{ type: 'session.created', properties: { info: projectBackendSession(event.session) } }]
      : [{ type: 'session.patched', properties: { sessionID: event.session.id, patch: { title: event.session.title, metadata: event.session.metadata, time: { updated: event.session.updatedAt, archived: event.session.archivedAt } } } }];
    case 'message': return [{ type: 'message.updated', properties: { info: projectBackendMessage(event.sessionId, event.message) } }, ...event.message.parts.map(part => ({ type: 'message.part.updated' as const, properties: { sessionID: event.sessionId, part: projectBackendPart(event.sessionId, event.message.id, part) } }))];
    case 'part': return [{ type: 'message.part.updated', properties: { sessionID: event.sessionId, part: projectBackendPart(event.sessionId, event.messageId, event.part) } }];
    case 'delta': return [{ type: 'message.part.delta', properties: { sessionID: event.sessionId, messageID: event.messageId, partID: event.partId, field: 'text', delta: event.delta } }];
    case 'status': return event.status === 'busy' ? [{ type: 'session.status', properties: { sessionID: event.sessionId, status: { type: 'busy' } } }] : [{ type: 'session.idle', properties: { sessionID: event.sessionId, outcome: event.outcome } }];
    case 'form': return [{ type: 'form.created', properties: { form: event.form } }];
    case 'form-settled': return [{ type: 'form.settled', properties: { sessionID: event.sessionId, formID: event.formId } }];
    case 'deleted': return [{ type: 'session.deleted', properties: { sessionID: event.sessionId } }];
  }
}
