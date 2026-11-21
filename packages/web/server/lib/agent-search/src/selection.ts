import type { WebSearchApi } from "@opencode/client/promise/api";
import type { Tool } from "@opencode/schema/tool";
import type { z } from "zod";
import type { SearchCommands } from "./commands.js";

interface SearchInvocation {
  sessionID: string;
  agent: string;
  messageID: string;
  id: string;
  signal: AbortSignal;
  progress(update: Tool.Metadata): Promise<void>;
}

interface SearchProvider {
  id: string;
  name: string;
  execute(input: { query: string }, context: { signal: AbortSignal }): Promise<Array<{ url: string; title?: string | undefined; content?: string | undefined; time: object }>>;
}
interface SearchTool {
  name: string;
  description: string;
  options: { namespace: string; codemode: false; permission: string };
  input: z.core.JSONSchema.JSONSchema;
  execute(input: SearchCommands, context: SearchInvocation): Promise<{ content: string; metadata: Tool.Metadata }>;
}
export interface SearchSelectionContext {
  websearch: Pick<WebSearchApi, "providers"> & {
    transform(run: (editor: {
      add(provider: SearchProvider): void;
      default: { get(): string | false | undefined; set(value: string): void };
    }) => void): Promise<void>;
  };
  tool: {
    reload(): Promise<void>;
    transform(run: (editor: {
      remove(id: string): void;
      namespace(namespace: { name: string; description: string }): void;
      add(tool: SearchTool): void;
    }) => void): Promise<void>;
  };
  session: { hook(name: "prompt", run: () => Promise<void>): Promise<void> };
  event: { subscribe(input: { types: string[]; signal: AbortSignal }): AsyncIterable<unknown> };
}

type SearchMode = "native" | "builtin" | "disabled";

export async function registerSelectedSearch(ctx: SearchSelectionContext, provider: SearchProvider, tool: SearchTool) {
  let selection: () => string | false | undefined;
  await ctx.websearch.transform(editor => {
    editor.add(provider);
    if (editor.default.get() === undefined) editor.default.set("native");
    selection = editor.default.get;
  });
  let providerIDs = new Set((await ctx.websearch.providers()).data.map(provider => provider.id));
  const selectedMode = (): SearchMode => {
    const selected = selection();
    if (selected === "random") return providerIDs.size > 0 ? "builtin" : "disabled";
    if (selected === false || selected === undefined || !providerIDs.has(selected)) return "disabled";
    return selected === "native" ? "native" : "builtin";
  };
  let registeredMode = selectedMode();
  const updateRegistry = async () => {
    const current = selectedMode();
    if (current === registeredMode) return;
    registeredMode = current;
    await ctx.tool.reload();
  };
  const refresh = async () => {
    providerIDs = new Set((await ctx.websearch.providers()).data.map(provider => provider.id));
    await updateRegistry();
  };
  await ctx.tool.transform(editor => {
    if (registeredMode !== "builtin") editor.remove("websearch");
    if (registeredMode !== "native") return;
    editor.namespace({ name: "web", description: "Tools for accessing the internet." });
    editor.add({ ...tool, async execute(input, invocation) {
      await refresh();
      if (selectedMode() !== "native") throw new Error("Select Codex search to use web.run.");
      return tool.execute(input, invocation);
    } });
  });
  const report = console.error.bind(console, "[agent-search] search selection updates failed:");
  let observer: Promise<void> | undefined;
  await ctx.session.hook("prompt", async () => {
    observer ??= ctx.websearch.transform(editor => {
      selection = editor.default.get;
      updateRegistry().catch(report);
    });
    await observer;
    await refresh();
  });
  const lifetime = new AbortController();
  const watching = (async () => {
    for await (const _event of ctx.event.subscribe({ types: ["websearch.updated"], signal: lifetime.signal })) await refresh();
  })().catch(error => { if (!lifetime.signal.aborted) report(error); });
  return async () => { lifetime.abort(); await watching; };
}
