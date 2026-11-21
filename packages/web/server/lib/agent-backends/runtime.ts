import fs from 'node:fs';
import path from 'node:path';
import { Identifier } from '@opencode/schema/identifier';
import type { RequestPermissionRequest, RequestPermissionResponse, SessionNotification, ToolCall, ToolCallUpdate } from '@agentclientprotocol/sdk';
import { z } from 'zod';
import { AcpBackend } from './acp.js';
import { mergeMetadataPatch } from '../openchamber-sessions/session-metadata-store.js';
import { backendSession, type BackendEvent, type BackendForm, type BackendMessage, type BackendPart, type BackendSession } from './contracts.js';

type SessionInfo = Omit<BackendSession, 'messages'>;
type ToolPart = Extract<BackendPart, { type: 'tool' }>;

export class AgentBackendRuntime {
  private readonly sessions = new Map<string, BackendSession>();
  private readonly nativeIds = new Map<string, BackendSession>();
  private readonly running = new Map<string, BackendMessage>();
  private readonly turns = new Map<string, Promise<void>>();
  private readonly questions = new Map<string, { form: BackendForm; resolve: (response: RequestPermissionResponse) => void }>();
  private readonly adapter: AcpBackend;
  private readonly root: string;
  private readonly publish: (directory: string, event: BackendEvent) => void;

  constructor(dataDir: string, publish: (directory: string, event: BackendEvent) => void, command?: string, args?: string[]) {
    this.publish = publish;
    this.root = path.join(dataDir, 'agent-backends', 'antigravity');
    fs.mkdirSync(this.root, { recursive: true });
    for (const file of fs.readdirSync(this.root).filter(file => file.endsWith('.json'))) {
      const session = backendSession.parse(JSON.parse(fs.readFileSync(path.join(this.root, file), 'utf8')));
      this.sessions.set(session.id, session);
      this.nativeIds.set(session.nativeId, session);
    }
    this.adapter = new AcpBackend({ update: update => this.update(update), permission: request => this.permission(request) }, command, args);
  }

  private save(session: BackendSession) {
    session.updatedAt = Date.now();
    const file = path.join(this.root, `${session.id}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(session), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
  }

  private emit(session: BackendSession, event: BackendEvent) { this.publish(session.directory, event); }

  private info(session: BackendSession): SessionInfo {
    const { messages: _messages, ...info } = session;
    return info;
  }

  list(directory?: string) { return [...this.sessions.values()].filter(session => !directory || session.directory === directory).map(session => this.info(session)); }

  get(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw Object.assign(new Error('Agent session not found.'), { status: 404 });
    return session;
  }

  async create(input: { id?: string | undefined; directory: string; title?: string | undefined; metadata?: BackendSession['metadata'] | undefined }) {
    const nativeId = await this.adapter.create(input.directory);
    const now = Date.now();
    const session: BackendSession = {
      id: input.id ?? `ses_acp_${Identifier.descending()}`, backend: 'antigravity', nativeId, directory: input.directory,
      title: input.title ?? 'Antigravity', createdAt: now, updatedAt: now, archivedAt: null, metadata: input.metadata ?? {}, messages: [],
    };
    this.sessions.set(session.id, session);
    this.nativeIds.set(nativeId, session);
    this.save(session);
    this.emit(session, { kind: 'session', session: this.info(session), created: true });
    return this.info(session);
  }

  patch(id: string, input: { title?: string | undefined; archivedAt?: number | null | undefined; metadata?: BackendSession['metadata'] | undefined }) {
    const session = this.get(id);
    if (input.title !== undefined) session.title = input.title;
    if (input.archivedAt !== undefined) session.archivedAt = input.archivedAt;
    if (input.metadata !== undefined) session.metadata = z.record(z.string(), z.json()).parse(mergeMetadataPatch(session.metadata, input.metadata));
    this.save(session);
    this.emit(session, { kind: 'session', session: this.info(session) });
    return this.info(session);
  }

  async prompt(id: string, input: { messageId: string; text: string; context?: Array<{ text: string }> | undefined }) {
    const session = this.get(id);
    if (this.running.has(id)) throw Object.assign(new Error('The agent is already running.'), { status: 409 });
    await this.adapter.restore(session.nativeId, session.directory);
    const now = Date.now();
    const user: BackendMessage = { id: input.messageId, role: 'user', createdAt: now, completedAt: now, parts: [{ id: `${input.messageId}:text:0`, type: 'text', text: input.text, startedAt: now, endedAt: now }], error: null };
    const assistant: BackendMessage = { id: `msg_${Identifier.ascending()}`, role: 'assistant', createdAt: now, completedAt: null, parts: [], error: null };
    session.messages.push(user, assistant);
    if (session.messages.length === 2 && session.title === 'Antigravity') session.title = input.text.split('\n')[0]?.slice(0, 100) || session.title;
    this.running.set(id, assistant);
    this.save(session);
    this.emit(session, { kind: 'session', session: this.info(session) });
    this.emit(session, { kind: 'message', sessionId: id, message: user });
    this.emit(session, { kind: 'message', sessionId: id, message: assistant });
    this.emit(session, { kind: 'status', sessionId: id, status: 'busy' });
    const text = [...(input.context ?? []).map(item => item.text), input.text].join('\n\n');
    const turn = this.adapter.prompt(session.nativeId, text).then(
      result => this.finish(session, assistant, result.stopReason === 'cancelled' ? 'interrupted' : 'succeeded'),
      error => { assistant.error = error instanceof Error ? error.message : String(error); this.finish(session, assistant, 'failed'); },
    );
    this.turns.set(id, turn);
  }

  private finish(session: BackendSession, message: BackendMessage, outcome: 'succeeded' | 'failed' | 'interrupted') {
    message.completedAt = Date.now();
    for (const part of message.parts) {
      part.endedAt = message.completedAt;
      if (part.type === 'tool' && (part.status === 'pending' || part.status === 'in_progress')) part.status = 'failed';
    }
    this.running.delete(session.id);
    this.turns.delete(session.id);
    this.save(session);
    this.emit(session, { kind: 'message', sessionId: session.id, message });
    this.emit(session, { kind: 'session', session: this.info(session) });
    this.emit(session, { kind: 'status', sessionId: session.id, status: 'idle', outcome });
  }

  private update(notification: SessionNotification) {
    const session = this.nativeIds.get(notification.sessionId);
    if (!session) return;
    const message = this.running.get(session.id);
    if (!message) return;
    const update = notification.update;
    if (update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'agent_thought_chunk') {
      if (update.content.type !== 'text') return;
      const type = update.sessionUpdate === 'agent_message_chunk' ? 'text' : 'reasoning';
      let part = message.parts.at(-1);
      if (!part || part.type !== type) {
        part = { id: `${message.id}:${message.parts.length}`, type, text: '', startedAt: Date.now(), endedAt: null };
        message.parts.push(part);
        this.emit(session, { kind: 'part', sessionId: session.id, messageId: message.id, part });
      }
      part.text += update.content.text;
      this.emit(session, { kind: 'delta', sessionId: session.id, messageId: message.id, partId: part.id, delta: update.content.text });
    } else if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
      this.updateTool(session, message, update);
    }
  }

  private updateTool(session: BackendSession, message: BackendMessage, update: ToolCall | ToolCallUpdate) {
    let part = message.parts.find((part): part is ToolPart => part.type === 'tool' && part.callId === update.toolCallId);
    if (!part) {
      part = { id: `${message.id}:tool:${update.toolCallId}`, type: 'tool', callId: update.toolCallId, name: update.name ?? update.kind ?? 'tool', title: update.title ?? '', status: 'pending', input: {}, output: '', files: [], startedAt: Date.now(), endedAt: null };
      message.parts.push(part);
    }
    if (update.name) part.name = update.name;
    if (update.title) part.title = update.title;
    if (update.status) part.status = update.status;
    if (update.rawInput !== undefined && update.rawInput !== null) {
      const raw = z.json().parse(update.rawInput);
      const record = z.record(z.string(), z.json()).safeParse(raw);
      part.input = record.success ? record.data : { value: raw };
    }
    if (update.content) {
      part.output = update.content.flatMap(item => item.type === 'content' && item.content.type === 'text' ? [item.content.text] : []).join('\n');
      part.files = update.content.flatMap(item => item.type === 'diff' ? [{ path: item.path, oldText: item.oldText ?? null, newText: item.newText }] : []);
    }
    if (part.status === 'completed' || part.status === 'failed') part.endedAt = Date.now();
    this.emit(session, { kind: 'part', sessionId: session.id, messageId: message.id, part });
  }

  private permission(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const session = this.nativeIds.get(request.sessionId);
    if (!session) throw new Error('Permission request has no owning session.');
    const form: BackendForm = { id: `frm_acp_${Identifier.ascending()}`, sessionID: session.id, title: request.toolCall.title ?? 'Antigravity', fields: [{ key: 'decision', type: 'string', required: true, options: request.options.map(option => ({ value: option.optionId, label: option.name })) }] };
    return new Promise(resolve => {
      this.questions.set(form.id, { form, resolve });
      this.emit(session, { kind: 'form', form });
    });
  }

  forms(directory?: string) { return [...this.questions.values()].map(question => question.form).filter(form => !directory || this.get(form.sessionID).directory === directory); }

  answer(sessionId: string, formId: string, optionId: string | null) {
    const session = this.get(sessionId);
    const question = this.questions.get(formId);
    if (!question || question.form.sessionID !== sessionId) throw Object.assign(new Error('Permission request not found.'), { status: 404 });
    if (optionId !== null && !question.form.fields[0].options.some(option => option.value === optionId)) throw Object.assign(new Error('Unknown permission option.'), { status: 400 });
    question.resolve({ outcome: optionId === null ? { outcome: 'cancelled' } : { outcome: 'selected', optionId } });
    this.questions.delete(formId);
    this.emit(session, { kind: 'form-settled', sessionId, formId });
  }

  async cancel(id: string) {
    const session = this.get(id);
    for (const question of this.forms().filter(form => form.sessionID === id)) this.answer(id, question.id, null);
    await this.adapter.cancel(session.nativeId);
  }

  async remove(id: string) {
    const session = this.get(id);
    if (this.running.has(id)) {
      await this.cancel(id);
      await this.turns.get(id);
    }
    fs.unlinkSync(path.join(this.root, `${id}.json`));
    this.sessions.delete(id);
    this.nativeIds.delete(session.nativeId);
    this.emit(session, { kind: 'deleted', sessionId: id });
  }

  statuses() { return Object.fromEntries([...this.running.keys()].map(id => [id, { type: 'busy' }])); }

  stop() { this.adapter.stop(); }
}
