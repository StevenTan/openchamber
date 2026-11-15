import { z } from "zod";
import type { ModelApi, ProviderApi, WebSearchApi, SessionApi } from "@opencode/client/promise/api";
import { CodexWebSearchProvider } from "./vendor/codex-provider.js";
import { validateSearchToolRequest, validateWebRunCommand, additionalCommands } from "./vendor/commands.js";
import { formatWebResponseText } from "./vendor/output.js";
import { describeCommandStatus } from "./vendor/web-format.js";
import type { WebRunCommand, SearchToolRequest } from "./vendor/commands.js";
import type { SearchResult } from "./vendor/normalize.js";
import type { SearchExecutionOptions } from "./vendor/provider.js";
import type { Tool } from "@opencode/schema/tool";
import { requestOptions, executionOptions, searchContext } from "./request.js";
import browsingGuidelines from "./vendor/web_run_description.md" with { type: "text" };

interface Invocation {
  sessionID: string;
  agent: string;
  messageID: string;
  id: string;
  signal: AbortSignal;
  progress(update: Tool.Metadata): Promise<void>;
}

interface ToolDefinition {
  name: string;
  description: string;
  options: { codemode: false; permission: string };
  input: z.core.JSONSchema.JSONSchema;
  execute(input: SearchToolRequest | WebRunCommand, context: Invocation): Promise<{ content: string; metadata: { command: WebRunCommand; results: SearchResult[]; provider: string } }>;
}

interface PluginContext {
  options: z.infer<typeof requestOptions>;
  provider: Pick<ProviderApi, "list">;
  model: Pick<ModelApi, "list" | "default">;
  permission: { assert(request: { sessionID: string; agent: string; action: string; resources: string[]; save: string[]; source: { type: "tool"; messageID: string; id: string } }): Promise<void> };
  websearch: Pick<WebSearchApi, "providers"> & {
    transform(fn: (editor: {
      add(provider: { id: string; name: string; execute(input: { query: string }, context: { signal: AbortSignal }): Promise<Array<{ url: string; title?: string; content?: string; time: object }>> }): void;
      default: { get(): string | false | undefined; set(value: string): void };
    }) => void): Promise<void>;
  };
  tool: { transform(fn: (editor: { add(tool: ToolDefinition): void }) => void): Promise<void> };
  session: Pick<SessionApi, "context"> & { hook(name: "context" | "generate" | "compaction", fn: (event: { tools: Record<string, { description: string; input: z.core.JSONSchema.JSONSchema }> }) => Promise<void>): Promise<void> };
}

const settingsSchema = z.object({
  baseURL: z.url().optional(),
  apiKey: z.string().min(1),
  timeout: z.number().int().positive().optional(),
});
const modelSettings = z.object({ baseURL: z.url().optional() }).default({});
const verbosity: z.core.JSONSchema.JSONSchema = { type: "string", enum: ["short", "medium", "long"] };
const queryProperties = {
  recency: { type: "integer", minimum: 0, description: "Recency filter in days." },
  domains: { type: "array", items: { type: "string", minLength: 1 }, description: "Allowed domains." },
} satisfies Record<string, z.core.JSONSchema.JSONSchema>;
const reference: z.core.JSONSchema.JSONSchema = { type: "string", minLength: 1, description: "Reference returned by this session's search, or a URL." };
const operation = (properties: Record<string, z.core.JSONSchema.JSONSchema>, required: string[]): z.core.JSONSchema.JSONSchema => ({
  type: "array", minItems: 1, items: { type: "object", properties, required, additionalProperties: false },
});

async function resolveProvider(ctx: PluginContext, sessionId: string, currentModel?: { providerID: string; modelID: string }) {
  const [providers, models] = await Promise.all([ctx.provider.list(), ctx.model.list()]);
  const locked = models.data.find(model => model.enabled && model.settings?.websearch === "always");
  const selected = locked ?? currentModel ?? (await ctx.model.default()).data;
  if (!selected) throw new Error("Select a model for Codex web search.");
  const provider = providers.data.find(item => item.id === selected.providerID);
  if (!provider) throw new Error("The search model's provider is unavailable.");
  const parsed = settingsSchema.safeParse(provider.settings);
  if (!parsed.success) throw new Error("Codex web search requires a provider baseURL and API key for a proxy supporting /alpha/search.");
  const model = models.data.find(item => item.providerID === selected.providerID && item.modelID === selected.modelID);
  const baseURL = model ? modelSettings.parse(model.settings).baseURL ?? parsed.data.baseURL : parsed.data.baseURL;
  if (!baseURL) throw new Error("Codex web search requires a provider or model baseURL for a proxy supporting /alpha/search.");
  return new CodexWebSearchProvider({
    endpoint: `${baseURL.replace(/\/$/, "")}/alpha/search`,
    credentials: { accessToken: parsed.data.apiKey },
    headers: provider.headers,
    model: selected.modelID,
    sessionId,
    timeoutMs: parsed.data.timeout,
  });
}

export default {
  id: "openchamber-search-tool",
  async setup(ctx: PluginContext) {
    const defaults = requestOptions.parse(ctx.options);
    let readSelection: () => string | false | undefined;
    await ctx.websearch.transform(editor => {
      editor.add({
        id: "native",
        name: "Codex search",
        async execute({ query }, { signal }) {
          const provider = await resolveProvider(ctx, `openchamber_${crypto.randomUUID()}`);
          const response = await provider.execute({ search_query: [{ q: query }] }, executionOptions(defaults, {}), signal);
          return response.results.flatMap(result => result.url ? [{ url: result.url, title: result.title, content: result.snippet, time: {} }] : []);
        },
      });
      if (editor.default.get() === undefined) editor.default.set("native");
      // Later configuration transforms can update the same rebuilt state.
      readSelection = editor.default.get;
    });
    const enabled = async () => {
      const providers = (await ctx.websearch.providers()).data;
      return readSelection() === "native" && providers.some(provider => provider.id === "native");
    };
    const execute = async (command: WebRunCommand, options: z.infer<typeof requestOptions>, context: Invocation) => {
      if (!await enabled()) throw new Error("Select Codex search to use this tool.");
      await ctx.permission.assert({
        sessionID: context.sessionID, agent: context.agent,
        action: "websearch", resources: [JSON.stringify(command)], save: ["*"],
        source: { type: "tool", messageID: context.messageID, id: context.id },
      });
      await context.progress({ title: describeCommandStatus(command), command });
      const recent = searchContext(await ctx.session.context({ sessionID: context.sessionID }), context.messageID);
      const provider = await resolveProvider(ctx, `openchamber_${context.sessionID}`, { providerID: recent.model.providerID, modelID: recent.model.id });
      const execution: SearchExecutionOptions = executionOptions(defaults, options);
      if (recent.input) execution.input = recent.input;
      const response = await provider.execute(command, execution, context.signal);
      return { content: formatWebResponseText(response), metadata: { command, results: response.results, provider: "native" } };
    };
    await ctx.tool.transform(editor => {
      editor.add({
        name: "codex-search",
        description: "Search the web with a single query. Results contain source URLs and references for codex-research. Use codex-research for batched searches, page browsing and specialized queries. Search current or uncertain facts and cite the supporting sources with Markdown links.",
        options: { codemode: false, permission: "websearch" },
        input: { type: "object", properties: { query: { type: "string", minLength: 1 }, ...queryProperties, response_length: verbosity, ...z.toJSONSchema(requestOptions).properties }, required: ["query"], additionalProperties: false },
        async execute(input, context) {
          const { query, response_length, ...filters } = validateSearchToolRequest(input);
          return execute({ search_query: [{ q: query, ...filters }], response_length: response_length ?? "short" }, requestOptions.parse(input), context);
        },
      });
      editor.add({
        name: "codex-research",
        description: `Execute web search, page browsing, image search, PDF screenshots, finance, weather, sports and time queries. References are scoped to the current session. ${browsingGuidelines}`,
        options: { codemode: false, permission: "websearch" },
        input: {
          type: "object", additionalProperties: false,
          properties: {
            search_query: operation({ q: { type: "string", minLength: 1 }, ...queryProperties }, ["q"]),
            open: operation({ ref_id: reference, lineno: { type: "integer", minimum: 0 } }, ["ref_id"]),
            find: operation({ ref_id: reference, pattern: { type: "string" } }, ["ref_id", "pattern"]),
            click: operation({ ref_id: reference, id: { type: "integer", minimum: 0 } }, ["ref_id", "id"]),
            response_length: verbosity,
            ...z.toJSONSchema(additionalCommands, { io: "input" }).properties,
            ...z.toJSONSchema(requestOptions).properties,
          },
        },
        async execute(input, context) {
          const command = validateWebRunCommand(input);
          return execute({ ...command, response_length: command.response_length ?? "long" }, requestOptions.parse(input), context);
        },
      });
    });
    for (const name of ["context", "generate", "compaction"] as const) {
      await ctx.session.hook(name, async event => {
        if (await enabled()) delete event.tools.websearch;
        else {
          delete event.tools["codex-search"];
          delete event.tools["codex-research"];
        }
      });
    }
  },
};
