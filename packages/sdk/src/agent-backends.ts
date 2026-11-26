import type { NewSessionResponse, SessionNotification, ContentBlock } from '@agentclientprotocol/sdk';
import type { TurnDiffReference } from './turn-diffs.js';
import type { z } from 'zod';
export { recordedTurnDiffSchema, turnDiffReferenceSchema, type TurnDiffReference } from './turn-diffs.js';

export interface AcpTokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export interface AcpTurn {
  id: string;
  assistantID: string;
  modelID: string;
  text: string;
  files: Array<{ mime: string; filename?: string | undefined; url: string }>;
  created: number;
  completed?: number;
  error?: string;
  variant?: string;
  updates: SessionNotification['update'][];
  followups: Array<{ id: string; text: string; files: AcpTurn['files']; created: number }>;
  tokens?: AcpTokenUsage;
  context?: { used: number; limit: number };
  fileDiff?: TurnDiffReference;
  toolCalls?: AgentToolCall[];
}

export interface AgentToolCall {
  id: string;
  callID: string;
  namespace: string;
  name: string;
  input: Record<string, z.infer<ReturnType<typeof z.json>> | undefined>;
  started: number;
  completed?: number;
  updateIndex: number;
  metadata?: Record<string, z.infer<ReturnType<typeof z.json>> | undefined>;
  result?: { content: Array<{ type: string; text?: string | undefined; data?: string | undefined; mimeType?: string | undefined }>; structuredContent?: Record<string, z.infer<ReturnType<typeof z.json>> | undefined> | undefined; _meta?: Record<string, z.infer<ReturnType<typeof z.json>> | undefined> | undefined; isError?: boolean | undefined };
  error?: string;
}

export interface AcpConversation {
  id: string;
  nativeID: string;
  directory: string;
  title: string;
  created: number;
  updated: number;
  draft: boolean;
  config: NonNullable<NewSessionResponse['configOptions']>;
  turns: AcpTurn[];
  tokens?: AcpTokenUsage;
  archived?: number | null;
  metadata?: Record<string, z.infer<ReturnType<typeof z.json>> | undefined> | undefined;
}

export type AcpConversationEvent =
  | { type: 'session'; session: AcpConversation; created?: boolean }
  | { type: 'deleted'; sessionID: string; directory: string }
  | { type: 'turn'; sessionID: string; directory: string; turn: AcpTurn; session: AcpConversation }
  | { type: 'update'; sessionID: string; directory: string; turnID: string; update: SessionNotification['update']; turn: AcpTurn; session: AcpConversation }
  | { type: 'control'; payload: unknown; directory: string };

export interface AcpSend {
  text: string;
  id: string;
  files: AcpTurn['files'];
  context: Array<{ text: string }>;
}

export type AcpPrompt = ContentBlock[];

export type AntigravityAuthentication =
  | { phase: 'idle' | 'starting' | 'verifying' | 'succeeded' | 'cancelled' }
  | { phase: 'waiting'; authorizationUrl: string }
  | { phase: 'failed'; message: string };

