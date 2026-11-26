import type { Model, Provider } from './catalog.js';
import type { Message, Metadata, ModelSelection, Part, Session } from './model.js';

export type ProviderCatalog = { providers: Provider[]; models: Model[]; default?: ModelSelection | undefined };
export type MessageRecord = { info: Message; parts: Part[] };
export type MessagePage = { items: MessageRecord[]; cursor: { previous?: string | undefined; next?: string | undefined } };
export type SessionPage = { sessions: Session[]; cursor: { previous?: string | undefined; next?: string | undefined }; spaces?: Array<{ id: string; name: string; taskTitle?: { title: string; by: 'user' | 'agent' } | null | undefined; state: 'complete' | 'partial' | 'stale' | 'unknown'; projectDirectory: string | null; directory: string | null }> | undefined };
export type CreateConversation = { id?: string | undefined; title?: string | undefined; agent?: string | undefined; model?: ModelSelection | undefined; metadata?: Metadata | undefined; backendID?: string | undefined; directory?: string | undefined | null };
export type ConversationContext = { id?: string | undefined; text: string; description?: string | undefined; metadata?: Metadata | undefined };
export type ConversationPrompt = {
  id: string; text: string; files: Array<{ mime: string; filename?: string | undefined; url: string }>;
  context: ConversationContext[];
  agents: Array<{ name: string; mention?: { start: number; end: number; text: string } | undefined }>;
  skills: Array<{ id: string }>; metadata?: Metadata | undefined; delivery?: 'steer' | 'queue' | undefined;
};
export type ConversationSkills = { attached: Array<{ id: string; name: string }>; unresolved: string[] };
export type SessionListOptions = { directory?: string | undefined | null; global?: boolean | undefined; limit?: number | undefined; order?: 'asc' | 'desc' | undefined; search?: string | undefined; cursor?: string | undefined; parentID?: string | undefined | null };
export type MessageListOptions = { limit?: number | undefined; cursor?: string | undefined; order?: 'asc' | 'desc' | undefined; partShells?: boolean | undefined };
