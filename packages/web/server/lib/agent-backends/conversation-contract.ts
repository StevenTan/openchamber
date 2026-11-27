import type { OpenCodeClient } from '@opencode/client';
import type { Agent, Provider } from '@openchamber/sdk/conversations/catalog';
import type { Session, ModelSelection, Project, Vcs, SessionStatus } from '@openchamber/sdk/conversations/model';
import type { ConversationPrompt, CreateConversation, MessageListOptions, MessagePage, MessageRecord, ProviderCatalog, SessionListOptions, SessionPage } from '@openchamber/sdk/conversations/http';
import type { FormRequest, FormValue, PermissionRequest } from '@openchamber/sdk/conversations/requests';
import type { ConversationConfiguration, ConversationLocation } from '@openchamber/sdk/conversations/http';

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
  cancelInbox(id: string, messageID: string): Promise<void>;
  model(id: string, model: ModelSelection): Promise<void>;
  agent(id: string, agent: string): Promise<void>;
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
  location(): Promise<ConversationLocation>;
  configuration(): Promise<ConversationConfiguration>;
  projects(): Promise<Project[]>;
  vcs(): Promise<Vcs>;
  statuses(): Promise<Record<string, SessionStatus>>;
  stageRevert(id: string, messageID: string): Promise<NonNullable<Session['revert']>>;
  clearRevert(id: string): Promise<void>;
  commitRevert(id: string): Promise<void>;
  fork(id: string, before?: string): Promise<Session>;
}
