import { Effect } from "effect";
import { Tool } from "@opencode/schema/tool";
import { z } from "zod";

const key = z.string().describe("Cache key within the current session.");
const storeInput = z.object({ key, value: z.json().describe("JSON value to save as a snapshot.") });
const storeOutput = z.object({ key: z.string() });
const loadInput = z.object({ key });
const loadOutput = z.json();
type Sessions = Map<string, Map<string, z.infer<typeof loadOutput>>>;
const memoryKey = Symbol.for("openchamber.code-mode.session-memory");
const host: typeof globalThis & { [memoryKey]?: { sessions: Sessions; listening: boolean } } = globalThis;
// OpenCode reloads local plugin modules when a Location is recreated.
export const processMemory = host[memoryKey] ??= { sessions: new Map(), listening: false };

export function createSessionMemory(sessions: Sessions = new Map()) {
  const store: Tool.Info<typeof storeInput, typeof storeOutput> = {
    name: "store",
    description: "Save a JSON value under a key in the current session's memory. Overwrites the same key. Values remain available across execute calls and conversation turns until the session is deleted or the server restarts. Returns the saved key. Await store before loading a dependent value.",
    input: storeInput,
    output: storeOutput,
    execute: ({ key, value }, context) => Effect.sync(() => {
      let values = sessions.get(context.sessionID);
      if (!values) {
        values = new Map();
        sessions.set(context.sessionID, values);
      }
      values.set(key, structuredClone(value));
      return { output: { key } };
    }),
  };
  const load: Tool.Info<typeof loadInput, typeof loadOutput> = {
    name: "load",
    description: "Read a JSON value saved by store in the current session. Returns a copy of the saved value; call store to save edits. Throws a catchable tool error when the key does not exist. Other sessions' values are private. Memory is cleared when the session is deleted or the server restarts.",
    input: loadInput,
    output: loadOutput,
    execute: ({ key }, context) => Effect.gen(function* () {
      const value = sessions.get(context.sessionID)?.get(key);
      if (value === undefined) return yield* Effect.fail(new Tool.Error({ message: `No stored value for key '${key}' in this session.` }));
      return { output: structuredClone(value) };
    }),
  };
  return {
    tools: [store, load],
    clear(sessionID: string) { sessions.delete(sessionID); },
  };
}
