import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { SessionApi } from "@opencode/client/promise/api";
import { truncateOutput } from "../../agent-command/src/output.js";
import type { SearchCommands, SearchOptions } from "./commands.js";
import { searchSettings } from "./commands.js";

const responseSchema = z.object({
  output: z.string(),
  results: z.array(z.unknown()).nullable().optional(),
});

interface SearchMessage {
  type: "message";
  role: "user" | "assistant";
  content: Array<{ type: "input_text" | "output_text"; text: string }>;
}

// OpenAI Codex ext/web-search/src/history.rs and tools/src/response_history.rs.
export function searchContext(messages: Awaited<ReturnType<SessionApi["context"]>>, messageID: string) {
  const current = messages.find(message => message.id === messageID);
  if (current?.type !== "assistant") throw new Error("Search requires the invoking assistant message.");
  const visible: SearchMessage[] = [];
  for (const message of messages) {
    if (message.type === "user" && message.text) {
      visible.push({ type: "message", role: "user", content: [{ type: "input_text", text: message.text }] });
    }
    if (message.type === "assistant") {
      const content = message.content.flatMap(part => part.type === "text" ? [{ type: "output_text" as const, text: part.text }] : []);
      if (content.length) visible.push({ type: "message", role: "assistant", content });
    }
    if (message.id === messageID) break;
  }
  const users = visible.flatMap((message, index) => message.role === "user" ? [index] : []);
  const last = users.at(-1);
  if (last === undefined) return { model: current.model };
  const input = visible.slice(users.at(-2) ?? last, last + 1);
  let remaining = 1000;
  for (const message of input) {
    if (message.role !== "assistant") continue;
    message.content = message.content.flatMap(part => {
      if (remaining === 0) return [];
      const text = truncateOutput(part.text, remaining);
      remaining = text.truncated ? 0 : remaining - Math.ceil(Buffer.byteLength(part.text, "utf8") / 4);
      return [{ ...part, text: text.output }];
    });
  }
  return { model: current.model, input: input.filter(message => message.content.length > 0) };
}

export interface SearchBackend {
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string> | undefined;
  timeout?: number | undefined;
}

// OpenAI Codex http-client/src/retry_after.rs and codex-client/src/retry.rs.
function retryDeadline(headers: Headers) {
  const value = headers.get("Retry-After")?.trim();
  if (!value) return undefined;
  const milliseconds = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  if (!Number.isFinite(milliseconds)) return undefined;
  return performance.now() + Math.max(0, milliseconds);
}

async function waitForRetry(attempt: number, signal: AbortSignal, deadline?: number, status?: number) {
  const milliseconds = deadline === undefined
    ? Math.floor(200 * 2 ** attempt * (0.9 + Math.random() * 0.2))
    : Math.max(0, deadline - performance.now());
  console.warn("[web.run] Retrying search request", { attempt: attempt + 1, delay: milliseconds, status });
  await delay(milliseconds, undefined, { signal });
}

export async function requestSearch(
  backend: SearchBackend,
  id: string,
  command: SearchCommands,
  config: SearchOptions,
  signal: AbortSignal,
  input?: SearchMessage[],
) {
  const headers = new Headers(backend.headers);
  headers.set("Authorization", `Bearer ${backend.apiKey}`);
  headers.set("Content-Type", "application/json");
  const url = new URL(`${backend.baseURL.replace(/\/$/, "")}/alpha/search`);
  const body = JSON.stringify({
    id,
    model: backend.model,
    input,
    commands: command,
    settings: searchSettings(config),
    max_output_tokens: config.tool_output_token_limit,
  });
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    let text: string;
    let deadline: number | undefined;
    const attemptSignal = backend.timeout === undefined ? signal : AbortSignal.any([signal, AbortSignal.timeout(backend.timeout)]);
    try {
      response = await fetch(url, { method: "POST", headers, signal: attemptSignal, body });
      deadline = retryDeadline(response.headers);
      text = await response.text();
    } catch (error) {
      signal.throwIfAborted();
      const transportError = error instanceof TypeError || attemptSignal.aborted;
      if (!transportError || attempt === 4) throw error;
      await waitForRetry(attempt, signal);
      continue;
    }
    if (!response.ok) {
      if (response.status >= 500 && response.status < 600 && attempt < 4) {
        await waitForRetry(attempt, signal, deadline, response.status);
        continue;
      }
      const detail = text.replaceAll(backend.apiKey, "[redacted]").slice(0, 1024);
      throw new Error(`Search request failed (HTTP ${response.status}): ${detail}`);
    }
    const parsed = responseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error("Search backend returned an invalid response.");
    return parsed.data;
  }
}
