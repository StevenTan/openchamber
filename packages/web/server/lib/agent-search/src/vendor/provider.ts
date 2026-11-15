import type { SearchResponse } from "./normalize.js";
import type { WebRunCommand, ResponseLength, EndpointPayloadOptions } from "./commands.js";

export interface SearchRequest {
  query: string;
  /** Recency filter in days (default: no filter) */
  recency?: number;
  /** Allowed domain filters (default: no filter) */
  domains?: string[];
  /** Desired output verbosity (default: tool-specific, see codex-search/codex-research) */
  response_length?: ResponseLength;
}

export type SearchExecutionOptions = Omit<EndpointPayloadOptions, "model">;

export interface WebSearchProvider {
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
  execute(command: WebRunCommand, options?: SearchExecutionOptions, signal?: AbortSignal): Promise<SearchResponse>;
  getSessionId(): string;
  setSessionId(id: string): void;
}
