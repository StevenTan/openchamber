import { z } from "zod";
import type { SessionApi } from "@opencode/client/promise/api";
import type { SearchInputMessage, SearchSettings } from "./vendor/commands.js";
import { truncateOutput } from "../../agent-command/src/output.js";

export const requestOptions = z.object({
  mode: z.enum(["cached", "indexed", "live"]).optional().describe("Use cached content, the search index, or live web access."),
  search_context_size: z.enum(["low", "medium", "high"]).optional().describe("Amount of search context returned by the backend."),
  user_location: z.object({ country: z.string().optional(), region: z.string().optional(), city: z.string().optional(), timezone: z.string().optional() }).strict().optional(),
  allowed_domains: z.array(z.string().min(1)).optional(),
  blocked_domains: z.array(z.string().min(1)).optional(),
  max_output_tokens: z.number().int().positive().optional().describe("Search response token budget. Defaults to 10000."),
});

export function executionOptions(defaults: z.infer<typeof requestOptions>, input: z.infer<typeof requestOptions>) {
  const options = { ...defaults, ...input };
  const settings: SearchSettings = { allowed_callers: ["direct"] };
  if (options.mode !== undefined) settings.external_web_access = options.mode === "indexed" ? "indexed" : options.mode === "live";
  if (options.search_context_size !== undefined) settings.search_context_size = options.search_context_size;
  if (options.user_location !== undefined) settings.user_location = { type: "approximate", ...options.user_location };
  if (options.allowed_domains !== undefined || options.blocked_domains !== undefined) {
    settings.filters = {};
    if (options.allowed_domains !== undefined) settings.filters.allowed_domains = options.allowed_domains;
    if (options.blocked_domains !== undefined) settings.filters.blocked_domains = options.blocked_domains;
  }
  return { settings, max_output_tokens: options.max_output_tokens ?? 10000 };
}

type Messages = Awaited<ReturnType<SessionApi["context"]>>;

export function searchContext(messages: Messages, messageID: string) {
  const current = messages.find(message => message.id === messageID);
  if (current?.type !== "assistant") throw new Error("Search requires the current assistant message.");
  // Match Codex's recent_input: the last two user texts and intervening assistant text.
  const visible: SearchInputMessage[] = [];
  for (const message of messages) {
    if (message.type === "user") visible.push({ type: "message", role: "user", content: [{ type: "input_text", text: message.text }] });
    if (message.type === "assistant") {
      const content = message.content.flatMap(part => part.type === "text" ? [{ type: "output_text" as const, text: part.text }] : []);
      if (content.length) visible.push({ type: "message", role: "assistant", content });
    }
    if (message.id === messageID) break;
  }
  const users = visible.flatMap((message, index) => message.role === "user" ? [index] : []);
  const last = users.at(-1);
  if (last === undefined) return { model: current.model };
  const tail = visible.slice(users.at(-2) ?? last, last + 1);
  let remaining = 1000;
  for (const message of tail) {
    if (message.role !== "assistant") continue;
    message.content = message.content.flatMap(part => {
      if (remaining === 0) return [];
      const text = truncateOutput(part.text, remaining);
      remaining = text.truncated ? 0 : remaining - Math.ceil(Buffer.byteLength(part.text, "utf8") / 4);
      return [{ ...part, text: text.output }];
    });
  }
  return { model: current.model, input: tail.filter(message => message.content.length > 0) };
}
