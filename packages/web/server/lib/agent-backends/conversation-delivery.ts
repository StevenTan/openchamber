import type { ConversationPrompt } from '@openchamber/sdk/conversations/http';
import type { ConversationApi } from './conversation-contract.js';
import type { QueueSendConfig } from '../message-queue/contracts.js';

export type ConversationContext = ConversationPrompt['context'][number] & {
  delivery?: 'steer' | 'queue' | undefined;
  resume?: boolean | undefined;
};
export type ConversationDelivery =
  | { type: 'prompt'; prompt: ConversationPrompt; source?: 'user' | 'synthetic'; selection?: QueueSendConfig; command?: { name: string; text: string } }
  | { type: 'context'; context: ConversationContext };

export interface ConversationDeliveryApi {
  prompt(id: string, input: ConversationPrompt, source?: 'user' | 'synthetic'): Promise<string>;
  command(id: string, input: { name: string; text: string; files: ConversationPrompt['files'] }): Promise<void>;
  context(id: string, input: ConversationContext & { context?: ConversationPrompt['context'] }, options?: { signal: AbortSignal }): Promise<void>;
}

export async function deliverConversation(api: Pick<ConversationApi, 'model' | 'agent' | keyof ConversationDeliveryApi>, sessionID: string, delivery: ConversationDelivery, options?: { signal: AbortSignal }) {
  if (delivery.type === 'context') {
    await api.context(sessionID, delivery.context, options);
    return delivery.context.id;
  }
  const { prompt, selection, command } = delivery;
  if (selection) {
    const { providerID, modelID, variant, agent } = selection;
    if (providerID && modelID) await api.model(sessionID, { providerID, id: modelID, ...variant && { variant } });
    if (agent) await api.agent(sessionID, agent);
  }
  if (command) {
    for (const context of prompt.context) await api.context(sessionID, { ...context, resume: false });
    await api.command(sessionID, { ...command, files: prompt.files });
    return prompt.id;
  }
  return api.prompt(sessionID, prompt, delivery.source);
}
