import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type McpInvocation = Pick<RequestHandlerExtra<ServerRequest, ServerNotification>, '_meta' | 'requestId' | 'signal' | 'requestInfo'>;
export type McpProgress = (metadata: NonNullable<CallToolResult['structuredContent']>) => Promise<void>;
export interface McpCallContext {
  sessionID: string;
  callID: string;
  signal: AbortSignal;
  messageID?: string | undefined;
  partID?: string | undefined;
  record?<Result extends CallToolResult>(namespace: string, name: string, input: NonNullable<CallToolRequest['params']['arguments']>, execute: (progress: McpProgress) => Promise<Result>): Promise<Result>;
}
export type ResolveMcpContext = (request: McpInvocation) => McpCallContext;

export const recordMcpCall = <Result extends CallToolResult>(context: McpCallContext, namespace: string, name: string, input: NonNullable<CallToolRequest['params']['arguments']>, execute: (progress: McpProgress) => Promise<Result>): Promise<Result> =>
  context.record ? context.record(namespace, name, input, execute) : execute(async () => {});
