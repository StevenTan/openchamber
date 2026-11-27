import type { SyncEvent } from '@openchamber/sdk/conversations/events';
import { syncEventSessionID, syncEventMessageID } from '@openchamber/sdk/conversations/events';
import type { MessageListOptions, MessagePage } from '@openchamber/sdk/conversations/http';
import type { MessageRecord } from '@openchamber/sdk/conversations/http';
import type { ConversationStorage } from './conversation-storage.js';
import { recordHistoryEvent } from './conversation-history-events.js';
import type { SessionStatus, Part, ToolPart } from '@openchamber/sdk/conversations/model';
import type { AgentToolCall } from '@openchamber/sdk/agent-backends';
import { z } from 'zod';
import type { AcpSend } from '@openchamber/sdk/agent-backends';
import { projectUserParts } from '@openchamber/sdk/conversations/opencode';
import type { ConversationPrompt } from '@openchamber/sdk/conversations/http';
import { createMessageId } from '../dispatch-results/runtime.js';
import type { ConversationContext } from './conversation-delivery.js';
import { conversationContext } from './prompt-schema.js';

export function createConversationRuntime(store: ConversationStorage, notify: (events: SyncEvent[], directory: string) => void = () => {}, statusChanged: (id: string, status: SessionStatus) => void = () => {}) {
  const complete = new Set<string>();
  const importing = new Map<string, Map<string, MessageRecord | undefined>>();
  const activity = new Map<string, SessionStatus>();
  const record = (event: SyncEvent) => {
    const id = syncEventSessionID(event);
    if (!id) return;
    if (event.type === 'session.status') {
      if (event.properties.status.type === 'idle') activity.delete(id);
      else activity.set(id, event.properties.status);
      statusChanged(id, event.properties.status);
    }
    if (event.type === 'session.idle' || event.type === 'session.deleted') activity.delete(id);
    if (event.type === 'session.idle') statusChanged(id, { type: 'idle' });
    const messageID = recordHistoryEvent(store, event) ?? syncEventMessageID(event);
    if (messageID) importing.get(id)?.set(messageID, store.message(id, messageID));
    if (event.type === 'session.deleted') complete.delete(id);
  };
  const publish = (events: SyncEvent[], directory: string) => {
    for (const event of events) record(event);
    notify(events, directory);
  };
  const current = (id: string) => {
    const row = store.readSession(id, db => db.get("SELECT id FROM messages WHERE session_id = ? AND json_extract(data, '$.info.role') = 'assistant' ORDER BY turn_sequence DESC, ordinal DESC LIMIT 1", [id]));
    return row && store.message(id, String(row.id));
  };
  return {
    record, publish, current,
    project(event: SyncEvent) {
      if (event.type !== 'message.part.updated' && event.type !== 'message.part.delta' && event.type !== 'message.tool.transition') return event;
      const messageID = event.type === 'message.part.updated' ? event.properties.part.messageID : event.properties.messageID;
      const partID = event.type === 'message.part.updated' ? event.properties.part.id : event.properties.partID;
      const part = store.message(event.properties.sessionID, messageID)?.parts.find(item => item.id === partID);
      return part?.type === 'tool' && part.state.status !== 'pending' && part.state.metadata?.openchamberActivityID ? undefined : event;
    },
    stageContext(sessionID: string, input: ConversationContext) {
      store.session(sessionID, db => db.run('INSERT INTO context_inputs(id, data) VALUES (?, ?)', [input.id ?? createMessageId(Date.now()), JSON.stringify(conversationContext.parse(input))]));
    },
    pendingContext(sessionID: string): ConversationContext[] {
      return (store.readSession(sessionID, db => db.all('SELECT id, data FROM context_inputs ORDER BY rowid')) ?? []).map(row => ({ ...JSON.parse(z.string().parse(row.data)), id: z.string().parse(row.id) }));
    },
    consumedContext(sessionID: string, inputs: ConversationContext[]) {
      store.session(sessionID, db => { for (const input of inputs) db.run('DELETE FROM context_inputs WHERE id = ?', [input.id ?? null]); });
    },
    admit(sessionID: string, input: AcpSend & { agents?: ConversationPrompt['agents'] }, source: 'user' | 'synthetic', directory?: string, created = Date.now()) {
      const context: MessageRecord[] = input.context.map(item => ({ info: { id: item.id ?? createMessageId(created), sessionID, role: 'synthetic', text: item.text, time: { created }, ...item.description !== undefined && { description: item.description }, ...item.metadata && { metadata: item.metadata } }, parts: [] }));
      const message: MessageRecord = source === 'synthetic'
        ? { info: { id: input.id, sessionID, role: 'synthetic', text: input.text, time: { created }, ...input.description !== undefined && { description: input.description }, ...input.metadata && { metadata: input.metadata } }, parts: [] }
        : { info: { id: input.id, sessionID, role: 'user', time: { created }, ...input.metadata && { metadata: input.metadata } }, parts: projectUserParts({ text: input.text, files: input.files.map(file => ({ mime: file.mime, data: '', ...file.filename !== undefined && { name: file.filename }, source: { type: 'uri', uri: file.url } })), agents: (input.agents ?? []).map(agent => ({ name: agent.name, ...agent.mention && { mention: agent.mention } })) }, { sessionID, messageID: input.id, created }) };
      publish([...context, message].filter(item => !store.message(sessionID, item.info.id)).flatMap(({ info, parts }): SyncEvent[] => [
        { type: 'message.updated', properties: { info } },
        { type: 'message.parts.replaced', properties: { sessionID, messageID: info.id, parts } },
      ]), directory ?? store.catalog.get(sessionID)?.directory ?? '');
    },
    statuses: () => Object.fromEntries(activity),
    replaceStatuses(backendID: string, values: Record<string, SessionStatus>) {
      for (const [id, owner] of store.catalog.owners()) if (owner === backendID) activity.delete(id);
      for (const [id, status] of Object.entries(values)) if (status.type !== 'idle') activity.set(id, status);
      return values;
    },
    tool(sessionID: string, call: AgentToolCall, directory: string) {
      const partID = call.partID ?? `host_tool_${call.id}`;
      const existing = store.readSession(sessionID, db => db.get("SELECT messages.id FROM messages, json_each(messages.data, '$.parts') AS part WHERE session_id = ? AND json_extract(part.value, '$.id') = ?", [sessionID, partID]));
      const message = existing ? store.message(sessionID, String(existing.id)) : call.messageID ? store.message(sessionID, call.messageID) : current(sessionID);
      if (!message) throw new Error('Tool activity has no assistant message');
      const base = { sessionID, messageID: message.info.id };
      const output = call.result?.content.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? '';
      const recorded = message.parts.find(item => item.id === partID);
      const metadata = z.record(z.string(), z.json()).parse({ ...recorded?.type === 'tool' && recorded.state.status !== 'pending' && recorded.state.metadata, ...call.result?._meta, ...call.metadata, openchamberActivityID: call.id });
      if (call.namespace === 'openchamber' && call.name === 'execute') {
        for (const key of ['toolCalls', 'openchamberToolCalls']) {
          const calls = z.array(z.object({ tool: z.string() }).catchall(z.json())).optional().parse(metadata[key]);
          if (calls) metadata[key] = calls.filter(item => item.tool === 'fetch');
        }
      }
      const error = call.error ?? (call.result?.isError ? output : undefined);
      const input = z.record(z.string(), z.json()).parse(call.input);
      const part: ToolPart = { ...base, id: partID, callID: call.callID, type: 'tool', tool: `${call.namespace}_${call.name}`,
        state: error !== undefined ? { status: 'error', input, error, metadata, time: { start: call.started, end: call.completed ?? call.started } }
          : call.completed ? { status: 'completed', input, output, metadata, time: { start: call.started, end: call.completed }, attachments: (call.result?.content ?? []).filter(item => item.type === 'image').map((item, index) => ({ ...base, type: 'file', id: `${call.id}_${index}`, mime: z.string().parse(item.mimeType), url: `data:${item.mimeType};base64,${item.data}` })) }
            : { status: 'running', input, metadata, time: { start: call.started } } };
      const native = message.parts.find(item => item.type === 'tool' && item.callID === call.callID && item.tool === part.tool && item.id !== part.id);
      const parts: Part[] = [...message.parts.filter(item => item.id !== part.id && item.id !== native?.id), part];
      const position = message.parts.findIndex(item => item.id === part.id || item.id === native?.id);
      if (position !== -1) { parts.pop(); parts.splice(position, 0, part); }
      publish([{ type: 'message.parts.replaced', properties: { sessionID, messageID: message.info.id, parts } }], directory);
    },
    async importSession(id: string, read: (input: MessageListOptions) => Promise<MessagePage>) {
      if (complete.has(id)) return;
      const updates = new Map<string, MessageRecord | undefined>();
      const imported = new Set<string>();
      importing.set(id, updates);
      try {
        let cursor: string | undefined;
        let sequence = 0;
        do {
          const page = await read({ limit: 100, order: 'asc', cursor });
          store.session(id, db => db.transaction(() => {
            for (const message of page.items) {
              imported.add(message.info.id);
              const existing = store.message(id, message.info.id);
              const owned = existing?.parts.filter(part => part.type === 'tool' && part.state.status !== 'pending' && part.state.metadata?.openchamberActivityID) ?? [];
              const native = message.parts.filter(part => !owned.some(tool => tool.id === part.id));
              const parts = owned.length ? [...(existing?.parts ?? []).flatMap(part => {
                const updated = native.find(item => item.id === part.id);
                return updated ? [updated] : owned.includes(part) ? [part] : [];
              }), ...native.filter(part => !existing?.parts.some(item => item.id === part.id))] : native;
              store.saveMessages([updates.get(message.info.id) ?? { ...message, parts }], ++sequence);
            }
          }));
          cursor = page.cursor.next;
        } while (cursor);
        store.session(id, db => db.transaction(() => {
          for (const row of db.all('SELECT id FROM messages')) {
            const messageID = z.string().parse(row.id);
            if (!imported.has(messageID) && !updates.has(messageID)) db.run('DELETE FROM messages WHERE id = ?', [messageID]);
          }
          for (const [messageID, message] of updates) {
            if (message) store.saveMessages([message], imported.has(messageID) ? undefined : ++sequence);
            else db.run('DELETE FROM messages WHERE session_id = ? AND id = ?', [id, messageID]);
          }
        }));
        complete.add(id);
      } finally {
        importing.delete(id);
      }
    },
    messages: store.messages,
    message: store.message,
    reset: () => complete.clear(),
    remove(id: string) {
      store.remove(id);
      complete.delete(id);
    },
    close: store.close,
  };
}
export type ConversationRuntime = ReturnType<typeof createConversationRuntime>;
