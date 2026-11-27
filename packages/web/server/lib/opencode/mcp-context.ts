import { z } from 'zod';
import type { ResolveMcpContext } from '../agent-tool/mcp-context.js';

export const resolveOpenCodeMcpContext: ResolveMcpContext = request => {
  const source = z.object({ messageID: z.string(), id: z.string().optional() }).optional().parse(request._meta?.['openchamber/source']);
  return {
    sessionID: z.string().min(1).parse(request._meta?.['ai.opencode/sessionID']),
    callID: z.string().optional().parse(request._meta?.['openchamber/callID']) ?? source?.id ?? String(request.requestId),
    signal: request.signal,
    messageID: source?.messageID,
    partID: source?.id,
  };
};
