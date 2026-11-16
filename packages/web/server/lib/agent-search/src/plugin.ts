import { z } from "zod";
import type { ModelApi, ProviderApi, SessionApi, WebSearchApi } from "@opencode/client/promise/api";
import type { Tool } from "@opencode/schema/tool";
import { commands, options } from "./commands.js";
import type { SearchCommands } from "./commands.js";
import { requestSearch, searchContext } from "./request.js";
import description from "./web_run_description.md" with { type: "text" };

interface Invocation {
  sessionID: string;
  agent: string;
  messageID: string;
  id: string;
  signal: AbortSignal;
  progress(update: Tool.Metadata): Promise<void>;
}

interface PluginContext {
  options: unknown;
  provider: Pick<ProviderApi, "list">;
  model: Pick<ModelApi, "list" | "default">;
  permission: { assert(request: {
    sessionID: string; agent: string; action: string; resources: string[]; save: string[];
    source: { type: "tool"; messageID: string; id: string };
  }): Promise<void> };
  websearch: Pick<WebSearchApi, "providers"> & {
    transform(fn: (editor: {
      add(provider: { id: string; name: string; execute(input: { query: string }, context: { signal: AbortSignal }): Promise<Array<{ url: string; title?: string; content?: string; time: object }>> }): void;
      default: { get(): string | false | undefined; set(value: string): void };
    }) => void): Promise<void>;
  };
  tool: { transform(fn: (editor: {
    namespace(namespace: { name: string; description: string }): void;
    add(tool: {
      name: string; description: string;
      options: { namespace: string; codemode: false; permission: string };
      input: z.core.JSONSchema.JSONSchema;
      execute(input: SearchCommands, context: Invocation): Promise<{ content: string; metadata: Tool.Metadata }>;
    }): void;
  }) => void): Promise<void> };
  session: Pick<SessionApi, "context"> & {
    hook(name: "context" | "generate" | "compaction", fn: (event: { tools: { websearch?: object; web_run?: object } }) => Promise<void>): Promise<void>;
  };
}

const providerSettings = z.object({
  baseURL: z.url().optional(),
  apiKey: z.string().min(1),
  timeout: z.number().int().positive().optional(),
});
const modelSettings = z.object({ baseURL: z.url().optional() });

async function resolveBackend(ctx: PluginContext, model: { providerID: string; modelID: string }) {
  const [providers, models] = await Promise.all([ctx.provider.list(), ctx.model.list()]);
  const provider = providers.data.find(provider => provider.id === model.providerID);
  if (!provider) throw new Error("The search model's provider is unavailable.");
  const settings = providerSettings.safeParse(provider.settings);
  if (!settings.success) throw new Error("Search requires a provider API key and a proxy supporting /alpha/search.");
  const selected = models.data.find(item => item.providerID === model.providerID && item.modelID === model.modelID);
  const baseURL = modelSettings.parse(selected?.settings ?? {}).baseURL ?? settings.data.baseURL;
  if (!baseURL) throw new Error("Search requires a provider or model baseURL supporting /alpha/search.");
  return { ...settings.data, baseURL, headers: provider.headers, model: model.modelID };
}

const providerResult = z.object({ url: z.string(), title: z.string().optional(), snippet: z.string().optional() });

export default {
  id: "openchamber-search-tool",
  async setup(ctx: PluginContext) {
    const config = options.parse(ctx.options);
    let selection: () => string | false | undefined;
    await ctx.websearch.transform(editor => {
      editor.add({
        id: "native",
        name: "Codex search",
        async execute({ query }, { signal }) {
          const model = (await ctx.model.default()).data;
          if (!model) throw new Error("Select a model for web search.");
          const response = await requestSearch(await resolveBackend(ctx, model), `openchamber_${crypto.randomUUID()}`,
            { search_query: [{ q: query }] }, config, signal);
          return (response.results ?? []).flatMap(result => {
            const parsed = providerResult.safeParse(result);
            return parsed.success ? [{ url: parsed.data.url, title: parsed.data.title, content: parsed.data.snippet, time: {} }] : [];
          });
        },
      });
      if (editor.default.get() === undefined) editor.default.set("native");
      selection = editor.default.get;
    });
    const enabled = async () => selection() === "native"
      && (await ctx.websearch.providers()).data.some(provider => provider.id === "native");

    await ctx.tool.transform(editor => {
      editor.namespace({ name: "web", description: "Tools for accessing the internet." });
      editor.add({
        name: "run",
        description,
        options: { namespace: "web", codemode: false, permission: "websearch" },
        input: z.toJSONSchema(commands),
        async execute(input, context) {
          const command = commands.parse(input);
          if (!await enabled()) throw new Error("Select Codex search to use web.run.");
          await ctx.permission.assert({
            sessionID: context.sessionID, agent: context.agent,
            action: "websearch", resources: [JSON.stringify(command)], save: ["*"],
            source: { type: "tool", messageID: context.messageID, id: context.id },
          });
          await context.progress({ title: "web.run", command, provider: "native" });
          const recent = searchContext(await ctx.session.context({ sessionID: context.sessionID }), context.messageID);
          const backend = await resolveBackend(ctx, { providerID: recent.model.providerID, modelID: recent.model.id });
          const { output, ...resultMetadata } = await requestSearch(backend, `openchamber_${context.sessionID}`, command, config, context.signal, recent.input);
          return {
            content: output,
            metadata: { command, provider: "native", ...resultMetadata },
          };
        },
      });
    });
    for (const name of ["context", "generate", "compaction"] as const) {
      await ctx.session.hook(name, async event => {
        if (await enabled()) delete event.tools.websearch;
        else delete event.tools.web_run;
      });
    }
  },
};
