import { setTimeout as delay } from "node:timers/promises";
import type { SearchRequest, SearchExecutionOptions, WebSearchProvider } from "./provider.js";
import { normalizeSearchResponseBody, type SearchResponse } from "./normalize.js";
import {
  validateWebRunCommand,
  serializeWebRunPayload,
  type WebRunCommand,
  type SearchQuery,
} from "./commands.js";
import {
  CodexAuthExpiredError,
  CodexRateLimitError,
  CodexHttpError,
  WebSearchTimeoutError,
  WebSearchCancelledError,
} from "./errors.js";

export interface CodexAuthCredentials {
  accessToken: string;
  accountId?: string;
}

export interface CodexWebSearchProviderOptions {
  endpoint: string;
  credentials: CodexAuthCredentials;
  headers?: Record<string, string>;
  timeoutMs?: number;
  customFetch?: typeof fetch;
  sessionId?: string;
  model: string;
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;

export class CodexWebSearchProvider implements WebSearchProvider {
  private endpoint: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private currentSessionId: string;
  private model: string;
  private maxRetries: number;

  private credentials: CodexAuthCredentials;
  private headers?: Record<string, string>;

  constructor(options: CodexWebSearchProviderOptions) {
    this.endpoint = options.endpoint;
    this.credentials = options.credentials;
    this.headers = options.headers;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options?.customFetch ?? globalThis.fetch;
    this.model = options.model;
    this.maxRetries = options?.maxRetries ?? 2;
    this.currentSessionId =
      options?.sessionId ?? `search_session_${Math.random().toString(36).substring(2, 10)}`;
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  setSessionId(id: string): void {
    if (id && id.trim()) {
      this.currentSessionId = id.trim();
    }
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    const searchQuery: SearchQuery = { q: request.query };
    if (request.recency !== undefined) {
      searchQuery.recency = request.recency;
    }
    if (request.domains && request.domains.length > 0) {
      searchQuery.domains = request.domains;
    }
    const command: WebRunCommand = { search_query: [searchQuery] };
    if (request.response_length) {
      command.response_length = request.response_length;
    }
    return this.execute(command, undefined, signal);
  }

  async execute(
    command: WebRunCommand,
    options?: SearchExecutionOptions,
    signal?: AbortSignal
  ): Promise<SearchResponse> {
    const validatedCmd = validateWebRunCommand(command);
    const auth = this.credentials;

    const controller = new AbortController();

    const abort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        throw new WebSearchCancelledError();
      }
      signal.addEventListener("abort", abort, { once: true });
    }

    const timeoutId = setTimeout(() => controller.abort("timeout"), this.timeoutMs);

    const headers = new Headers(this.headers);
    headers.set("Authorization", `Bearer ${auth.accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("User-Agent", "codex-cli/0.147.0-alpha.6.5");
    if (auth.accountId) headers.set("ChatGPT-Account-ID", auth.accountId);

    const sessionId = options?.sessionId ?? this.currentSessionId;
    const payload = serializeWebRunPayload(validatedCmd, {
      ...options,
      sessionId,
      model: this.model,
    });

    try {
      let response: Response | null = null;
      let attempt = 0;

      while (attempt <= this.maxRetries) {
        attempt++;
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (response.status === 502 || response.status === 503 || response.status === 504) {
          if (attempt <= this.maxRetries) {
            await response.body?.cancel();
            await delay(500 * attempt, undefined, { signal: controller.signal });
            continue;
          }
        }
        break;
      }

      if (!response) {
        throw new CodexHttpError(500, "No response received");
      }

      if (response.status === 401 || response.status === 403) {
        throw new CodexAuthExpiredError();
      }

      if (response.status === 429) {
        throw new CodexRateLimitError();
      }

      if (!response.ok) {
        const text = (await response.text()).replaceAll(auth.accessToken, "[redacted]");
        throw new CodexHttpError(response.status, text.slice(0, 200));
      }

      const body = await response.json();
      const normalized = normalizeSearchResponseBody(body);

      return normalized;
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === "timeout") throw new WebSearchTimeoutError(this.timeoutMs);
        throw new WebSearchCancelledError();
      }
      throw err;
    } finally {
      signal?.removeEventListener("abort", abort);
      clearTimeout(timeoutId);
    }
  }
}
