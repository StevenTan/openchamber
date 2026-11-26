import type { OpenCodeClient } from '@opencode/client';
import type { Agent, Provider } from '@openchamber/sdk/conversations/catalog';
import type { Session, ModelSelection } from '@openchamber/sdk/conversations/model';
import type { ConversationContext, ConversationPrompt, ConversationSkills, CreateConversation, MessageListOptions, MessagePage, MessageRecord, ProviderCatalog, SessionListOptions, SessionPage } from '@openchamber/sdk/conversations/http';
import type { FormRequest, FormValue, PermissionRequest } from '@openchamber/sdk/conversations/requests';

export interface ConversationContextOptions {
  client: OpenCodeClient;
  directory?: string | undefined;
}

export interface ConversationApi {
  create(input: CreateConversation): Promise<Session>;
  list(input: SessionListOptions): Promise<SessionPage>;
  get(id: string): Promise<Session>;
  remove(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  messages(id: string, options: MessageListOptions): Promise<MessagePage>;
  message(id: string, messageID: string): Promise<MessageRecord>;
  inbox(id: string): Promise<Array<{ info: import('@openchamber/sdk/conversations/model').UserMessage | import('@openchamber/sdk/conversations/model').SyntheticMessage; parts: import('@openchamber/sdk/conversations/model').Part[] | null }>>;
  model(id: string, model: ModelSelection): Promise<void>;
  agent(id: string, agent: string): Promise<void>;
  context(id: string, input: ConversationContext & { delivery?: 'steer' | 'queue' | undefined }): Promise<ConversationContext[]>;
  skills(names: readonly string[]): Promise<ConversationSkills>;
  prompt(id: string, input: ConversationPrompt): Promise<string>;
  interrupt(id: string): Promise<void>;
  catalog(sessionID?: string, includeProviders?: boolean): Promise<ProviderCatalog>;
  providers(): Promise<Provider[]>;
  agents(): Promise<Agent[]>;
  pendingForms(): Promise<FormRequest[]>;
  pendingPermissions(): Promise<PermissionRequest[]>;
  replyPermission(id: string, requestID: string, decision: 'once' | 'always' | 'reject', message?: string): Promise<void>;
  replyForm(id: string, formID: string, answer: Record<string, FormValue>): Promise<void>;
  cancelForm(id: string, formID: string, message?: string): Promise<void>;
}
