import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type McpInvocation = Pick<RequestHandlerExtra<ServerRequest, ServerNotification>, '_meta' | 'requestId' | 'signal' | 'requestInfo'>;
export interface McpCallContext {
  sessionID: string;
  callID: string;
  signal: AbortSignal;
  record?<Result extends CallToolResult>(namespace: string, name: string, input: NonNullable<CallToolRequest['params']['arguments']>, execute: () => Promise<Result>): Promise<Result>;
}
export type ResolveMcpContext = (request: McpInvocation) => McpCallContext;

export const recordMcpCall = <Result extends CallToolResult>(context: McpCallContext, namespace: string, name: string, input: NonNullable<CallToolRequest['params']['arguments']>, execute: () => Promise<Result>): Promise<Result> =>
  context.record ? context.record(namespace, name, input, execute) : execute();
