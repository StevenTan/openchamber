import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { createSessionKnowledgeRuntime } from '../session-knowledge/runtime.js';
import type { createRoutingRuntime } from '../routing/runtime.js';
import type { createExistingSessionTasks } from '../scheduled-tasks/existing-session.js';
import type { createSessionGoal } from '../session-goal/create.js';
import type { QueuedItem, MessageQueueSessionSnapshot } from './runtime.js';
import type { ConversationPrompt } from '@openchamber/sdk/conversations/http';

export interface MessageQueueOptions {
  sendPrompt(sessionID: string, directory: string, item: QueuedItem & { prompt: ConversationPrompt }): Promise<void>;
  onPromptCancelled?(sessionID: string, item: QueuedItem, directory: string): void;
  backendForSession?: (sessionID: string) => { isIdle(): Promise<boolean>; send(directory: string, item: QueuedItem): Promise<void> } | undefined;
  globalEventHub: Pick<GlobalMessageStreamHub, 'subscribeEvent' | 'subscribeStatus'>;
  buildOpenCodeUrl: (route: string, query: string) => string | URL;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  sessionKnowledgeRuntime?: Pick<ReturnType<typeof createSessionKnowledgeRuntime>, 'sync'> | null;
  broadcastGlobalUiEvent?: (event: { type: 'openchamber:message-queue.updated'; properties: { revision: number; session: MessageQueueSessionSnapshot } }) => void;
  onPromptSent?: (sessionId: string) => void;
  beforeScheduledTaskSend?: ReturnType<typeof createExistingSessionTasks>['beforeSend'];
  validateScheduledTaskTarget?: ReturnType<typeof createExistingSessionTasks>['validateTarget'];
  onScheduledTaskResult?: ReturnType<typeof createExistingSessionTasks>['result'];
  resolveAutoSelection?: ReturnType<typeof createRoutingRuntime>['resolveAutoSelection'] | null;
  persistSessionGoal?: Parameters<typeof createSessionGoal>[0]['persistSessionGoal'];
  isDeliveryHeld?: (sessionId: string) => boolean;
  deliveryHoldReady?: Promise<unknown>;
  dataDir: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  dispatchQuietMs?: number;
  abortHoldMs?: number;
  retryDelayMs?: (failures: number) => number;
}
