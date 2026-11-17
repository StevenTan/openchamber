import { z } from 'zod';
import type { ToolPart } from './model';
import { isExecuteTool } from './tools';

const fields = {
  tool: z.string(),
  input: z.record(z.string(), z.json()),
  time: z.object({ start: z.number(), end: z.number() }),
  metadata: z.record(z.string(), z.json()).optional(),
};
const call = z.discriminatedUnion('status', [
  z.object({ ...fields, status: z.literal('completed'), output: z.string() }),
  z.object({ ...fields, status: z.literal('error'), error: z.string() }),
]);
const calls = z.array(call.nullable().catch(null));

/** Recorded inner calls use the same presentation model as directly invoked tools. */
export function codeModeCallParts(part: ToolPart): ToolPart[] {
  if (!isExecuteTool(part.tool) || !('metadata' in part.state)) return [];
  const parsed = calls.safeParse(part.state.metadata?.openchamberToolCalls);
  if (!parsed.success) return [];
  return parsed.data.flatMap((call, index): ToolPart[] => {
    if (!call) return [];
    const shared = { input: call.input, metadata: call.metadata, time: call.time };
    return [{
      ...part, id: `${part.id}:call:${index}`, callID: `${part.callID}:call:${index}`, tool: call.tool,
      state: call.status === 'completed' ? { ...shared, status: 'completed', output: call.output }
        : { ...shared, status: 'error', error: call.error },
    }];
  });
}
