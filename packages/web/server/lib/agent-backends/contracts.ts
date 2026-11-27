import type { SessionInfo, SessionListInput, ModelInfo } from '@opencode/client';
import type { ControlClient } from '../openchamber-control/opencode-client.js';
import type { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import type { OpenCodeSessionArchive } from '../openchamber-sessions/session-archive.js';
import type { OpenCodeSessionMetadata } from '../openchamber-sessions/session-metadata-store.js';
import type { createChatsScope } from '../scheduled-tasks/chats-scope.js';
import type { MessageQueueOptions } from '../message-queue/options.js';
import type { createScheduledTaskService } from '../scheduled-tasks/service.js';
import type { QuestionSessionApi } from '../agent-question/src/runtime.js';
import type { SessionClient } from '../openchamber-sessions/opencode-client-contract.js';
import type { FormField } from '../openchamber-control/form-answer.js';
import type { ConversationApi, ConversationContextOptions } from './conversation-contract.js';
import type { ConversationInput } from './conversation-input.js';

export type BackendID = 'opencode' | 'antigravity';
export type SessionClientFactory = (directory?: string | null) => Promise<ControlClient>;
export interface SessionMessage {
  id: string;
  type: string;
  text?: unknown;
  content?: { type: string; text?: unknown }[];
  model?: { providerID?: unknown; id?: unknown };
  time: { created: number; completed?: number };
}
export interface SessionReader {
  get(sessionID: string): Promise<SessionInfo>;
  list(input: SessionListInput): ReturnType<ControlClient['session']['list']>;
  active(): Promise<Record<string, { type: 'running' | 'busy' }>>;
  messages(sessionID: string, input: { limit?: number; order?: 'asc' | 'desc'; cursor?: string }): Promise<{ data: SessionMessage[]; cursor?: { next?: string | null } }>;
  rename(sessionID: string, title: string): Promise<void>;
  interrupt(sessionID: string): Promise<{ interrupted: boolean }>;
  hasPendingInput(sessionID: string): Promise<boolean>;
  forms(sessionID: string): Promise<{
    get: (input: { sessionID: string; formID: string }) => Promise<{ fields: readonly FormField[] }>;
    reply: ControlClient['session']['form']['reply'];
    cancel: ControlClient['session']['form']['cancel'];
    list: (input: { sessionID: string }) => Promise<readonly { id: string; state?: { status?: string } }[]>;
  }>;
}
export interface DispatchContext {
  openCode: ReturnType<typeof createOpenChamberSessionService>;
  syncKnowledge(sessionID: string, directory: string): Promise<boolean>;
  chatsScope: ReturnType<typeof createChatsScope>;
  deliver: ConversationInput['deliver'];
}
export type ModelCatalogReader = NonNullable<Parameters<typeof createScheduledTaskService>[0]['readModelCatalog']>;
export type CatalogModel = Pick<ModelInfo, 'id' | 'providerID' | 'name'> & Partial<Pick<ModelInfo, 'family' | 'time' | 'cost' | 'status'>> & { variants: readonly { id: string }[] };
export interface BackendAdapter {
  id: BackendID;
  providers: readonly string[];
  sessions(client: SessionClientFactory): SessionReader;
  dispatch(context: DispatchContext): Pick<DispatchContext['openCode'], 'create' | 'send' | 'fork'> & { queueBackend: NonNullable<MessageQueueOptions['backendForSession']> };
  archive: OpenCodeSessionArchive;
  metadata: OpenCodeSessionMetadata;
  modelCatalog(readOpenCode: ModelCatalogReader): ModelCatalogReader;
  question(client: () => SessionClient): QuestionSessionApi;
  models(client: (directory: string) => Promise<ControlClient>, directory: string, sessionID?: string | null): Promise<{ models: readonly CatalogModel[]; providers: Map<string, string> }>;
  conversations(options: ConversationContextOptions): ConversationApi;
}
export type BackendRuntime = Omit<BackendAdapter, 'archive' | 'metadata' | 'sessions'> & {
  sessions(client: SessionClientFactory): Omit<SessionReader, 'get' | 'list' | 'rename'>;
};
