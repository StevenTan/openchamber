import { CodeMode, Extension, Tool } from "@opencode/codemode";
import { Cause, Effect, Exit, Predicate, Schema } from "effect";
import { display } from "./fetch.js";

export interface ScriptTool {
  id: string;
  path: string;
  description: string;
  input: Tool.SchemaType;
  output: Tool.SchemaType;
  execute(input: Schema.Json): Effect.Effect<{
    value: Schema.Json;
    text: string;
    metadata?: Schema.JsonObject | undefined;
    files?: Array<{ type: "file"; uri: string; mime: string }>;
  }, unknown>;
}
export interface ScriptCall {
  tool: string;
  input: Schema.Json;
  status: "running" | "completed" | "error";
  time: { start: number; end?: number };
  output?: string;
  error?: string;
  metadata?: Schema.JsonObject | undefined;
}

export function scriptRuntime(tools: readonly ScriptTool[], progress: (calls: ScriptCall[]) => Effect.Effect<void>, extensions: readonly Extension.Extension[] = []) {
  const calls: ScriptCall[] = [];
  const files: Array<{ type: "file"; uri: string; mime: string }> = [];
  const networkCalls = new WeakMap<object, ScriptCall>();
  const runtime = CodeMode.make({ extensions, hooks: {
    "extension.before": call => Effect.gen(function* () {
      if (call.name !== "fetch") return;
      const row: ScriptCall = { tool: "fetch", input: display(call.args), status: "running", time: { start: Date.now() } };
      calls.push(row);
      networkCalls.set(call, row);
      yield* progress(calls);
    }),
    "extension.after": (call, result) => Effect.gen(function* () {
      const row = networkCalls.get(call);
      if (!row) return;
      row.status = result.status === "success" ? "completed" : "error";
      row.time.end = Date.now();
      yield* progress(calls);
    }),
  }, tools: Object.fromEntries(tools.map(tool => [tool.path, Tool.make({
    description: tool.description, input: tool.input, output: tool.output,
    execute: input => Effect.gen(function* () {
      const args = yield* Schema.decodeUnknownEffect(Schema.Json)(input);
      const call: ScriptCall = { tool: tool.id, input: args, status: "running", time: { start: Date.now() } };
      calls.push(call);
      yield* progress(calls);
      return yield* tool.execute(args).pipe(
        Effect.tap(result => Effect.sync(() => {
          call.status = "completed";
          call.output = result.text;
          call.metadata = result.metadata;
          files.push(...result.files ?? []);
        })),
        Effect.map(result => result.value),
        Effect.onExit(exit => Effect.gen(function* () {
          call.time.end = Date.now();
          if (Exit.isFailure(exit)) {
            call.status = "error";
            const error = Cause.squash(exit.cause);
            call.error = error instanceof Error ? error.message : String(error);
          }
          yield* progress(calls);
        })),
      );
    }),
  })])) });
  const namespaces = [...new Set(runtime.catalog.map(tool => tool.path.split(".")[0]))];
  const bindings = `{${namespaces.map(name => `[${JSON.stringify(name)}]: tools[${JSON.stringify(name)}]`).join(",")}}`;
  return { catalog: runtime.catalog, execute: (code: string) => runtime.execute(`return await (async (tools, search) => {\n${code}\n})(${bindings}, undefined);`).pipe(Effect.map(result => ({
    result: !result.ok && result.error.kind === "UnknownTool" ? {
      ...result, error: { ...result.error, suggestions: ["Use the exact JavaScript tools path shown in the complete Code Mode catalog in the execute tool description."] },
    } : result,
    calls, files,
  }))) };
}

export function scriptOutput(result: CodeMode.Result) {
  const output = result.ok ? Predicate.isString(result.value) ? result.value : JSON.stringify(result.value, null, 2)
    : [result.error.message, ...result.error.suggestions ?? []].join("\n");
  const warnings = result.ok && result.warnings?.length ? `Warnings:\n${result.warnings.map(item => `- [${item.kind}] ${item.message}`).join("\n")}` : undefined;
  const logs = result.logs?.length ? `Logs:\n${result.logs.join("\n")}` : undefined;
  return [output, warnings, logs].filter(part => part !== undefined && part !== "").join("\n\n");
}
