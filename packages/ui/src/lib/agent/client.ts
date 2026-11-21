import type { ContextPartMetadata } from '@/lib/messages/contextParts';
import type { SpaceMark } from '@/lib/spaces/spaces-store';
import type { Agent, Model, Provider } from './catalog';
import type { FormValue } from './requests';
import type { Message, Metadata, ModelRef, ModelSelection, Part, Session, SyntheticMessage, UserMessage } from './model';

export type SessionPage = {
  sessions: Session[];
  cursor: { previous?: string; next?: string };
  spaces?: SpaceMark[];
};

export type SessionListOptions = {
  directory?: string | null;
  global?: boolean;
  limit?: number;
  order?: 'asc' | 'desc';
  search?: string;
  cursor?: string;
  parentID?: string | null;
};

export type MessagePage = {
  items: Array<{ info: Message; parts: Part[] }>;
  cursor: { previous?: string; next?: string };
};

export type PendingInboxMessage = { info: UserMessage | SyntheticMessage; parts: Part[] | null };
export type ProviderCatalog = { providers: Provider[]; models: Model[]; default?: ModelRef };
export type SkillMentions = { names: readonly string[]; instructionFor: (names: readonly string[]) => string | null };
export type SyntheticContextInput = { id?: string; text: string; metadata?: ContextPartMetadata; description?: string };
export type SendMessageInput = {
  runtimeKey?: string;
  id: string;
  model?: ModelSelection;
  agent?: string;
  providerID: string;
  text: string;
  files?: Array<{ id?: string; type: 'file'; mime: string; filename?: string; url: string }>;
  context?: SyntheticContextInput[];
  messageId?: string;
  agentMentions?: Array<{ name: string; source?: { value: string; start: number; end: number } }>;
  metadata?: Metadata;
  delivery?: 'steer' | 'queue';
  directory?: string | null;
  skills?: SkillMentions;
  beforeSend?: () => void;
  commitRevert?: () => Promise<void>;
};

export interface ConversationClient {
  listSessionsPage(options?: SessionListOptions): Promise<SessionPage>;
  listSessions(directory?: string | null): Promise<Session[]>;
  createSession(params?: { id?: string; title?: string; agent?: string; model?: ModelSelection; metadata?: Metadata }, directory?: string | null): Promise<Session>;
  getSession(id: string, directory?: string | null, signal?: AbortSignal): Promise<Session>;
  deleteSession(id: string, directory?: string | null): Promise<boolean>;
  renameSession(id: string, title: string, directory?: string | null): Promise<void>;
  getSessionMessages(id: string, options?: { limit?: number; cursor?: string; order?: 'asc' | 'desc'; partShells?: boolean }, directory?: string | null): Promise<MessagePage>;
  getSessionMessage(id: string, messageID: string, directory?: string | null): Promise<{ info: Message; parts: Part[] }>;
  getSessionInbox(id: string, directory?: string | null): Promise<readonly PendingInboxMessage[]>;
  switchSessionModel(id: string, model: ModelSelection, directory?: string | null): Promise<void>;
  switchSessionAgent(id: string, agent: string, directory?: string | null): Promise<void>;
  sendMessage(input: SendMessageInput): Promise<string>;
  abortSession(id: string, directory?: string | null): Promise<boolean>;
  getProvidersForConfig(directory?: string | null, options?: { fresh?: boolean }): Promise<ProviderCatalog>;
  listAgents(directory?: string | null): Promise<Agent[]>;
  replyToPermission(sessionID: string, requestID: string, reply: 'once' | 'always' | 'reject', options?: { message?: string; directory?: string | null }): Promise<boolean>;
  replyToForm(sessionID: string, formID: string, answer: Record<string, FormValue>, directory?: string | null): Promise<boolean>;
  cancelForm(sessionID: string, formID: string, directory?: string | null, message?: string): Promise<boolean>;
}
