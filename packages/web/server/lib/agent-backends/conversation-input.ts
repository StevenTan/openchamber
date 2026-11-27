import type { ConversationPrompt } from '@openchamber/sdk/conversations/http';
import type { SyncEvent } from '@openchamber/sdk/conversations/events';
import { projectUserParts } from '@openchamber/sdk/conversations/opencode';
import { createMessageId } from '../dispatch-results/runtime.js';
import { createMessageQueueRuntime, type MessageQueueOptions, type QueuedItem } from '../message-queue/runtime.js';
import type { ConversationApi } from './conversation-contract.js';
import { deliverConversation, type ConversationDelivery } from './conversation-delivery.js';
import type { ConversationRuntime } from './conversation-runtime.js';

type Queue = ReturnType<typeof createMessageQueueRuntime>;
type Inbox = Awaited<ReturnType<ConversationApi['inbox']>>;
type PendingPrompt = QueuedItem & ({ prompt: ConversationPrompt; contextInput?: never } | { contextInput: Extract<ConversationDelivery, { type: 'context' }>['context']; prompt?: never });
const hasPrompt = (item: QueuedItem): item is PendingPrompt => item.prompt !== undefined || item.contextInput !== undefined;

function projectInput(sessionID: string, item: PendingPrompt): Inbox {
  if (item.contextInput) return [{ info: { id: item.contextInput.id ?? item.id, sessionID, role: 'synthetic', text: item.contextInput.text, ...item.contextInput.description !== undefined && { description: item.contextInput.description }, ...item.contextInput.metadata && { metadata: item.contextInput.metadata }, time: { created: item.createdAt }, pending: true }, parts: null }];
  const input = item.prompt;
  const context: Inbox = input.context.map(entry => ({ info: { id: entry.id ?? createMessageId(item.createdAt), sessionID, role: 'synthetic', text: entry.text, ...entry.description !== undefined && { description: entry.description }, ...entry.metadata && { metadata: entry.metadata }, time: { created: item.createdAt }, pending: true }, parts: null }));
  return [...context, {
    info: { id: input.id, sessionID, role: 'user', time: { created: item.createdAt }, ...input.metadata && { metadata: input.metadata } },
    parts: projectUserParts({ text: input.text, files: input.files.map(file => ({ mime: file.mime, data: '', ...file.filename !== undefined && { name: file.filename }, source: { type: 'uri', uri: file.url } })), agents: input.agents.map(agent => ({ name: agent.name, ...agent.mention && { mention: agent.mention } })) }, { sessionID, messageID: input.id, created: item.createdAt }),
  }];
}

export function createConversationInput(options: {
  queue: Queue;
  api(sessionID: string, directory?: string): ConversationApi;
  publish(events: SyncEvent[], directory: string): void;
  runtime: ConversationRuntime;
}) {
  const runtime = {
    async prompt(api: ConversationApi, sessionID: string, input: ConversationPrompt) {
      if (input.delivery !== 'queue') { await dispatch(api, sessionID, { type: 'prompt', prompt: input }); return input.id; }
      const session = await api.get(sessionID);
      const prompt = { ...input, context: input.context.map(entry => ({ ...entry, id: entry.id ?? createMessageId(Date.now()) })) };
      await options.queue.enqueue(sessionID, session.directory, {
        content: input.text, text: input.text, attachments: [], context: [], prompt,
        sendConfig: { providerID: session.model?.providerID, modelID: session.model?.id, variant: session.model?.variant, agent: session.agent },
      });
      const pending = options.queue.pendingPrompts(sessionID).filter(hasPrompt).filter(item => item.prompt?.id === input.id).flatMap(item => projectInput(sessionID, item));
      options.publish(pending.flatMap(({ info, parts }): SyncEvent[] => [
        { type: 'message.updated', properties: { info } },
        ...parts ? [{ type: 'message.parts.replaced' as const, properties: { sessionID, messageID: info.id, parts } }] : [],
      ]), session.directory);
      return input.id;
    },
    async inbox(api: ConversationApi, sessionID: string): Promise<Inbox> {
      await options.queue.load();
      const native = await api.inbox(sessionID);
      const pending = options.queue.pendingPrompts(sessionID).filter(hasPrompt).flatMap(item => projectInput(sessionID, item));
      return [...native, ...pending.filter(item => !native.some(entry => entry.info.id === item.info.id))];
    },
    async cancel(api: ConversationApi, sessionID: string, messageID: string) {
      await options.queue.load();
      const item = options.queue.pendingPrompts(sessionID).filter(hasPrompt).find(entry => (entry.prompt?.id ?? entry.contextInput?.id) === messageID);
      if (item) await options.queue.remove(sessionID, item.id);
      else await api.cancelInbox(sessionID, messageID);
    },
    async deliver(sessionID: string, directory: string | undefined, delivery: ConversationDelivery, requestOptions?: { signal: AbortSignal }): Promise<string | undefined> {
      return dispatch(options.api(sessionID, directory), sessionID, delivery, requestOptions);
    },
    cancelled(sessionID: string, item: QueuedItem, directory: string) {
      if (!hasPrompt(item)) return;
      options.publish(projectInput(sessionID, item).map(({ info }) => ({ type: 'message.removed', properties: { sessionID, messageID: info.id } })), directory);
    },
  };
  async function dispatch(api: ConversationApi, sessionID: string, delivery: ConversationDelivery, requestOptions?: { signal: AbortSignal }): Promise<string | undefined> {
    requestOptions?.signal.throwIfAborted();
    delivery = delivery.type === 'context'
      ? { ...delivery, context: { ...delivery.context, id: delivery.context.id ?? createMessageId(Date.now()) } }
      : { ...delivery, prompt: { ...delivery.prompt, context: delivery.prompt.context.map(entry => ({ ...entry, id: entry.id ?? createMessageId(Date.now()) })) } };
    if (delivery.type === 'context' && delivery.context.resume === false) {
      options.runtime.stageContext(sessionID, delivery.context);
      return delivery.context.id;
    }
    if (delivery.type === 'context' && delivery.context.delivery === 'queue') {
      const session = await api.get(sessionID);
      const contextInput = delivery.context;
      await options.queue.enqueue(sessionID, session.directory, { text: contextInput.text, content: contextInput.text, attachments: [], context: [], sendConfig: {}, contextInput });
      const pending = options.queue.pendingPrompts(sessionID).filter(hasPrompt).filter(item => item.contextInput?.id === contextInput.id).flatMap(item => projectInput(sessionID, item));
      options.publish(pending.map(({ info }) => ({ type: 'message.updated', properties: { info } })), session.directory);
      return contextInput.id;
    }
    const pending = options.runtime.pendingContext(sessionID);
    if (delivery.type === 'context') {
      await api.context(sessionID, { ...delivery.context, context: pending }, requestOptions);
      options.runtime.consumedContext(sessionID, pending);
      return delivery.context.id;
    }
    delivery = { ...delivery, prompt: { ...delivery.prompt, context: [...pending, ...delivery.prompt.context] } };
    const id = await deliverConversation(api, sessionID, delivery, requestOptions);
    options.runtime.consumedContext(sessionID, pending);
    return id;
  }
  return runtime;
}
export type ConversationInput = ReturnType<typeof createConversationInput>;

export function createConversationQueue(options: Omit<MessageQueueOptions, 'deliver' | 'onPromptCancelled'> & { input(): ConversationInput }) {
  return createMessageQueueRuntime({ ...options, deliver: async (...args) => { await options.input().deliver(...args); }, onPromptCancelled: (...args) => options.input().cancelled(...args) });
}
