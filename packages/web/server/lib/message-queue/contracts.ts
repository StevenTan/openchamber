import type { ScheduledTaskProvenance } from '../scheduled-tasks/existing-session.js';
import type { ConversationPrompt } from '@openchamber/sdk/conversations/http';
import type { QueueRecord } from './runtime.js';

export interface QueueSendConfig {
  providerID?: string;
  modelID?: string;
  agent?: string;
  variant?: string;
}

export interface QueuedGoal {
  tokenBudget: number | null;
  objective?: string;
}

export interface QueuedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  source: 'local' | 'server' | 'vscode';
  serverPath?: string;
  agentPath?: string;
  dataUrl: string;
}

export type QueuedContextPart =
  | { kind: 'context'; text: string; metadata: QueueRecord; instructions?: string }
  | { kind: 'instruction' | 'synthetic'; text: string; metadata?: never };

export interface QueuedItemInput {
  content: string;
  text: string;
  agentMention?: string;
  attachments: QueuedAttachment[];
  context: QueuedContextPart[];
  contextPreview?: string;
  sendConfig: QueueSendConfig;
  goal?: QueuedGoal;
  scheduledTask?: ScheduledTaskProvenance;
  prompt?: ConversationPrompt;
}

export interface QueuedItem extends QueuedItemInput {
  id: string;
  createdAt: number;
  syntheticIds?: string[];
}

export interface PublicQueuedItem extends Omit<QueuedItem, 'context' | 'syntheticIds' | 'attachments' | 'prompt'> {
  attachments: Omit<QueuedAttachment, 'dataUrl'>[];
}

export interface SessionQueue {
  directory: string;
  items: QueuedItem[];
}

export interface MessageQueueSessionSnapshot {
  sessionId: string;
  directory: string;
  items: PublicQueuedItem[];
  sendingId: string | null;
}
