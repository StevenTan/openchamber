import { Cause, Effect, Exit, Predicate } from "effect";
import { z } from "zod";
import type { Tool } from "@opencode/schema/tool";

const inputSchema = z.record(z.string(), z.json());
const callIndex = Symbol("openchamberCallIndex");
type Identity = Pick<Tool.Context, "sessionID" | "messageID" | "id">;
type Call = {
  tool: string;
  input?: z.infer<typeof inputSchema>;
  status: "running" | "completed" | "error";
  time: { start: number; end?: number };
  output?: string;
  error?: string;
  metadata?: Tool.Metadata;
};
const key = (context: Identity) => JSON.stringify([context.sessionID, context.messageID, context.id]);

export function createCallActivity() {
  const scripts = new Map<string, { sessionID: string; calls: Call[] }>();
  return {
    start(context: Identity) { scripts.set(key(context), { sessionID: context.sessionID, calls: [] }); },
    clear(sessionID: string) {
      for (const [id, script] of scripts) if (script.sessionID === sessionID) scripts.delete(id);
    },
    finish(context: Identity) {
      const id = key(context);
      const calls = scripts.get(id)?.calls;
      scripts.delete(id);
      for (const call of calls ?? []) {
        if (call.status !== "running") continue;
        call.status = "error";
        call.error = "Tool execution did not complete.";
        call.time.end = Date.now();
      }
      return calls;
    },
    complete(context: Identity, input: Parameters<Tool.Info["execute"]>[0], result: { content?: Tool.Result["content"]; metadata?: Tool.Metadata }) {
      const metadata = { ...result.metadata };
      if (!(callIndex in metadata)) return;
      const index = z.number().safeParse(metadata[callIndex]);
      if (!index.success) return;
      const call = scripts.get(key(context))?.calls[index.data];
      Reflect.deleteProperty(metadata, callIndex);
      result.metadata = metadata;
      if (!call) return;
      call.input = inputSchema.safeParse(input).data;
      call.status = "completed";
      call.time.end = Date.now();
      call.metadata = metadata;
      call.output = Predicate.isString(result.content) ? result.content
        : (result.content ?? []).filter(part => part.type === "text").map(part => part.text).join("\n");
    },
    wrap(tool: string, execute: Tool.Info["execute"]): Tool.Info["execute"] {
      return (input, context) => Effect.gen(function* () {
        const script = scripts.get(key(context));
        if (!script) return yield* execute(input, context);
        const call: Call = { tool, input: inputSchema.safeParse(input).data, status: "running", time: { start: Date.now() } };
        const index = script.calls.length;
        script.calls.push(call);
        return yield* execute(input, context).pipe(
          Effect.map(result => ({ ...result, metadata: { ...result.metadata, [callIndex]: index } })),
          Effect.onExit(exit => Effect.sync(() => {
            if (Exit.isFailure(exit)) {
              call.status = "error";
              call.time.end = Date.now();
              const error = Cause.squash(exit.cause);
              call.error = error instanceof Error ? error.message : String(error);
            }
          })),
        );
      });
    },
  };
}
