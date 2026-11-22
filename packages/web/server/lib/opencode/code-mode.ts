import { OpenCode } from '@opencode/client';
import { Schema } from 'effect';
import { z } from 'zod';
import type { CodeModeFileActivity } from '../agent-code-mode/mcp.js';
import type { createOpenCodeToolPermissions } from './tool-permissions.js';

const sourceSchema = z.object({ sessionID: z.string(), messageID: z.string(), id: z.string(), directory: z.string() });

export function createCodeModeFileActivity(options: Parameters<typeof createOpenCodeToolPermissions>[0]): CodeModeFileActivity {
  return async (phase, request, tool, input) => {
    const source = sourceSchema.optional().parse(request._meta?.['openchamber/source']);
    if (!source) return {};
    const client = OpenCode.make({ baseUrl: options.buildOpenCodeUrl('/', '').replace(/\/$/, ''), headers: options.getOpenCodeAuthHeaders() });
    const result = await client.rpc.call({ rpcID: 'openchamber-turn-diffs', method: 'capture', location: { directory: source.directory },
      input: { ...source, phase, tool, input: z.json().parse(input) } }, phase === 'before' ? { signal: request.signal } : undefined);
    return Schema.decodeUnknownSync(Schema.JsonObject)(result.output);
  };
}
