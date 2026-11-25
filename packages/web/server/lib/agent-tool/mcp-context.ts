import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

export type McpInvocation = Pick<RequestHandlerExtra<ServerRequest, ServerNotification>, '_meta' | 'requestId' | 'signal' | 'requestInfo'>;
export interface McpCallContext {
  sessionID: string;
  callID: string;
  signal: AbortSignal;
}
export type ResolveMcpContext = (request: McpInvocation) => McpCallContext;
