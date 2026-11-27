import type { ConversationPrompt } from '@openchamber/sdk/conversations/http';
import type { SyncEvent } from '@openchamber/sdk/conversations/events';
import { projectUserParts } from '@openchamber/sdk/conversations/opencode';
import { createMessageId } from '../dispatch-results/runtime.js';
import { createMessageQueueRuntime, type MessageQueueOptions, type QueuedItem } from '../message-queue/runtime.js';
import type { ConversationApi } from './conversation-contract.js';

type Queue = ReturnType<typeof createMessageQueueRuntime>;
type Inbox = Awaited<ReturnType<ConversationApi['inbox']>>;
type PendingPrompt = QueuedItem & { prompt: ConversationPrompt };
const hasPrompt = (item: QueuedItem): item is PendingPrompt => item.prompt !== undefined;

function projectInput(sessionID: string, item: PendingPrompt): Inbox {
  const input = item.prompt;
  const context: Inbox = input.context.map(entry => ({ info: { id: entry.id ?? createMessageId(item.createdAt), sessionID, role: 'synthetic', text: entry.text, ...entry.description !== undefined && { description: entry.description }, ...entry.metadata && { metadata: entry.metadata }, time: { created: item.createdAt }, pending: true }, parts: null }));
  return [...context, {
    info: { id: input.id, sessionID, role: 'user', time: { created: item.createdAt }, ...input.metadata && { metadata: input.metadata } },
    parts: projectUserParts({ text: input.text, files: input.files.map(file => ({ mime: file.mime, data: '', ...file.filename !== undefined && { name: file.filename }, source: { type: 'uri', uri: file.url } })), agents: input.agents.map(agent => ({ name: agent.name, ...agent.mention && { mention: agent.mention } })) }, { sessionID, messageID: input.id, created: item.createdAt }),
  }];
}

export function createConversationInput(options: {
  queue: Queue;
  api(sessionID: string, directory: string): ConversationApi;
  publish(events: SyncEvent[], directory: string): void;
}) {
  return {
    async prompt(api: ConversationApi, sessionID: string, input: ConversationPrompt) {
      if (input.delivery !== 'queue') return api.prompt(sessionID, input);
      const session = await api.get(sessionID);
      const prompt = { ...input, context: input.context.map(entry => ({ ...entry, id: entry.id ?? createMessageId(Date.now()) })) };
      await options.queue.enqueue(sessionID, session.directory, {
        content: input.text, text: input.text, attachments: [], context: [], prompt,
        sendConfig: { providerID: session.model?.providerID, modelID: session.model?.id, variant: session.model?.variant, agent: session.agent },
      });
      const pending = options.queue.pendingPrompts(sessionID).filter(hasPrompt).filter(item => item.prompt.id === input.id).flatMap(item => projectInput(sessionID, item));
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
      const item = options.queue.pendingPrompts(sessionID).filter(hasPrompt).find(entry => entry.prompt.id === messageID);
      if (item) await options.queue.remove(sessionID, item.id);
      else await api.cancelInbox(sessionID, messageID);
    },
    async send(sessionID: string, directory: string, item: PendingPrompt) {
      const api = options.api(sessionID, directory);
      const { providerID, modelID, variant, agent } = item.sendConfig;
      if (providerID && modelID) await api.model(sessionID, { providerID, id: modelID, ...variant && { variant } });
      if (agent) await api.agent(sessionID, agent);
      await api.prompt(sessionID, { ...item.prompt, delivery: undefined });
    },
    cancelled(sessionID: string, item: QueuedItem, directory: string) {
      if (!hasPrompt(item)) return;
      options.publish(projectInput(sessionID, item).map(({ info }) => ({ type: 'message.removed', properties: { sessionID, messageID: info.id } })), directory);
    },
  };
}
export type ConversationInput = ReturnType<typeof createConversationInput>;

export function createConversationQueue(options: Omit<MessageQueueOptions, 'sendPrompt' | 'onPromptCancelled'> & { input(): ConversationInput }) {
  return createMessageQueueRuntime({ ...options, sendPrompt: (...args) => options.input().send(...args), onPromptCancelled: (...args) => options.input().cancelled(...args) });
}
