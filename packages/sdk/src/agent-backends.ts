import type { NewSessionResponse, SessionNotification, ContentBlock } from '@agentclientprotocol/sdk';

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
}

export type AcpConversationEvent =
  | { type: 'session'; session: AcpConversation }
  | { type: 'deleted'; sessionID: string; directory: string }
  | { type: 'turn'; sessionID: string; directory: string; turn: AcpTurn }
  | { type: 'update'; sessionID: string; directory: string; turnID: string; update: SessionNotification['update'] }
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

