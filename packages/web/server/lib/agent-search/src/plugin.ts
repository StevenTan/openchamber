import { z } from "zod";
import type { ModelApi, ProviderApi, SessionApi } from "@opencode/client/promise/api";
import { commands, options } from "./commands.js";
import { requestSearch, searchContext } from "./request.js";
import { registerSelectedSearch } from "./selection.js";
import type { SearchSelectionContext } from "./selection.js";
import description from "./web_run_description.js";

interface PluginContext extends SearchSelectionContext {
  options: unknown;
  provider: Pick<ProviderApi, "list">;
  model: Pick<ModelApi, "list" | "default">;
  permission: { assert(request: {
    sessionID: string; agent: string; action: string; resources: string[]; save: string[];
    source: { type: "tool"; messageID: string; id: string };
  }): Promise<void> };
  session: SearchSelectionContext["session"] & Pick<SessionApi, "context">;
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
    return registerSelectedSearch(ctx, {
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
    }, {
      name: "run",
      description,
      options: { namespace: "web", codemode: false, permission: "websearch" },
      input: z.toJSONSchema(commands),
      async execute(input, context) {
        const command = commands.parse(input);
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
  },
};
