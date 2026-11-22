import { z } from 'zod';
import type { ResolveMcpContext } from '../agent-tool/mcp-context.js';

export const resolveOpenCodeMcpContext: ResolveMcpContext = request => ({
  sessionID: z.string().min(1).parse(request._meta?.['ai.opencode/sessionID']),
  callID: String(request.requestId),
  signal: request.signal,
});
