import { z } from 'zod';
import { runtimeFetch } from '../runtime-fetch';
import { ascendingId } from '../opencode/ids';
import { backendMessageSchema, backendSessionSchema, backendSnapshotSchema, projectBackendMessage, projectBackendPart, projectBackendSession, type AgentBackendAdapter } from './model';
import type { FormValue, JsonValue, Metadata } from '../opencode/model';

const BASE = '/api/agent-backends/sessions';

export async function backendRequest(path: string, method = 'GET', body?: Record<string, JsonValue | undefined>, signal?: AbortSignal) {
  const options: RequestInit = { method, headers: { 'content-type': 'application/json' }, signal };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await runtimeFetch(path, options);
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(value).error);
  return value;
}

export class AcpSessionAdapter implements AgentBackendAdapter {
  async snapshot(directory?: string | null) {
    return backendSnapshotSchema.parse(await backendRequest(BASE + (directory ? `?directory=${encodeURIComponent(directory)}` : '')));
  }

  async createSession(params: Parameters<AgentBackendAdapter['createSession']>[0], directory?: string | null) {
    return projectBackendSession(backendSessionSchema.parse(await backendRequest(BASE, 'POST', { id: params?.id, directory, title: params?.title, metadata: params?.metadata })));
  }

  async getSession(id: string, _directory?: string | null, signal?: AbortSignal) {
    return projectBackendSession(backendSessionSchema.parse(await backendRequest(`${BASE}/${id}`, 'GET', undefined, signal)));
  }

  async getSessionMessages(id: string) {
    const messages = z.array(backendMessageSchema).parse(await backendRequest(`${BASE}/${id}/messages`));
    return { items: messages.map(message => ({ info: projectBackendMessage(id, message), parts: message.parts.map(part => projectBackendPart(id, message.id, part)) })), cursor: {} };
  }

  async sendMessage(params: Parameters<AgentBackendAdapter['sendMessage']>[0]) {
    const messageId = params.messageId ?? ascendingId('msg');
    params.beforeSend?.();
    await backendRequest(`${BASE}/${params.id}/prompt`, 'POST', { messageId, text: params.text, context: params.context });
    return messageId;
  }

  async abortSession(id: string) { await backendRequest(`${BASE}/${id}/cancel`, 'POST'); return true; }
  async deleteSession(id: string) { await backendRequest(`${BASE}/${id}`, 'DELETE'); return true; }
  async patch(id: string, change: { title?: string; archivedAt?: number | null; metadata?: Metadata }) { return projectBackendSession(backendSessionSchema.parse(await backendRequest(`${BASE}/${id}`, 'PATCH', change))); }
  async answer(id: string, formId: string, answer: Record<string, FormValue> | null) {
    await backendRequest(`${BASE}/${id}/forms/${formId}`, 'POST', { decision: answer?.decision ?? null });
    return true;
  }
}
