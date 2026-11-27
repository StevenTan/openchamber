import type { createSessionGoal } from '../session-goal/create.js';
import type { readProcessInstance as readProcessInstanceDefault } from './process-instance.js';
import type { ExistingSessionDependencies, ExistingSessionTaskRunEvent } from './existing-session.js';
import type { ScheduledTaskStore } from '../projects/contracts.js';
import type { ScheduledWorktreeBridge } from './worktree-bridge.js';
import type { readModelCatalog, resolveSessionDefaults } from './session-defaults.js';
import type { createRoutingRuntime } from '../routing/runtime.js';
import type { SessionMetadata } from '../openchamber-sessions/session-metadata-store.js';
import type { createOpenCodeLifecycleRuntime } from '../opencode/lifecycle.js';
import type { createPermissionAutoAcceptRuntime } from '../permission-auto-accept/runtime.js';
import type { createAntigravityBackend } from '../agent-backends/antigravity.js';
import type { ConversationInput } from '../agent-backends/conversation-input.js';

export interface ScheduledTasksDependencies extends Omit<ExistingSessionDependencies, 'createClient' | 'messageQueueRuntime' | 'projectConfigRuntime'> {
  projectConfigRuntime: ScheduledTaskStore;
  messageQueueRuntime?: ExistingSessionDependencies['messageQueueRuntime'];
  buildOpenCodeUrl: (route: string, query: string) => string | URL;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  waitForOpenCodeReady?: ReturnType<typeof createOpenCodeLifecycleRuntime>['waitForOpenCodeReady'] | null;
  emitTaskRunEvent?: (event: ScheduledTaskRunEvent) => void;
  setSessionAutoAccept?: ReturnType<typeof createPermissionAutoAcceptRuntime>['setSessionPolicy'] | null;
  sessionKnowledgeRuntime?: { sync: (sessionID: string, directory: string, prompt: string) => Promise<boolean> } | null;
  persistSessionGoal?: Parameters<typeof createSessionGoal>[0]['persistSessionGoal'];
  readSessionDefaults?: ((projectID: string, catalog: Awaited<ReturnType<typeof readModelCatalog>>) => Promise<ReturnType<typeof resolveSessionDefaults> | null>) | null;
  resolveAutoSelection?: ReturnType<typeof createRoutingRuntime>['resolveAutoSelection'] | null;
  readSessionMetadata: (sessionID: string, options: { signal: AbortSignal }) => Promise<SessionMetadata | null | undefined>;
  readProcessInstance?: typeof readProcessInstanceDefault;
  readWorktreeIdentity?: (directory: string) => Promise<string | null>;
  cleanupPause?: (signal: AbortSignal) => Promise<void>;
  createTaskWorktree?: ScheduledWorktreeBridge['create'];
  removeTaskWorktree?: ScheduledWorktreeBridge['remove'] | null;
  isGitRepository?: ScheduledWorktreeBridge['isGitRepository'] | null;
  logger?: Pick<Console, 'warn' | 'info'>;
  maxGlobalConcurrency?: number;
  maxProjectConcurrency?: number;
  maxRunDurationMs?: number;
  antigravity?: ReturnType<typeof createAntigravityBackend>;
  deliver: ConversationInput['deliver'];
  waitApplicationCommands?: (sessionID: string) => Promise<void>;
}

export interface ScheduledTaskRunEvent extends ExistingSessionTaskRunEvent {
  isolated?: boolean;
  branch?: string | null;
}

