// Adapted from OpenAI Codex codex-rs/codex-api/src/search.rs (Apache-2.0).
// See ../codex-LICENSE and ../UPSTREAM.md.
import { z } from "zod";

const unsigned = z.number().int().nonnegative();
const query = z.object({
  q: z.string().describe("Search query."),
  recency: unsigned.optional().describe("Whether to filter by recency, as a number of recent days."),
  domains: z.array(z.string()).optional().describe("Whether to filter by a specific list of domains."),
}).strict();

export const commands = z.object({
  search_query: z.array(query).optional().describe("Query the internet search engine for a given list of queries."),
  image_query: z.array(query).optional().describe("Query the image search engine for a given list of queries."),
  open: z.array(z.object({
    ref_id: z.string().describe("Reference id or URL to open."),
    lineno: unsigned.optional().describe("Line number to position the page at."),
  }).strict()).optional().describe("Open pages by reference id or URL."),
  click: z.array(z.object({
    ref_id: z.string().describe("Reference id containing the numbered link."),
    id: unsigned.describe("Numbered link id to open."),
  }).strict()).optional().describe("Open links from previously opened pages."),
  find: z.array(z.object({
    ref_id: z.string().describe("Reference id or URL to search within."),
    pattern: z.string().describe("Text pattern to find."),
  }).strict()).optional().describe("Find text patterns in pages."),
  finance: z.array(z.object({
    ticker: z.string().describe("Ticker symbol to look up."),
    type: z.enum(["equity", "fund", "crypto", "index"]).describe("Asset type to look up."),
    market: z.string().optional().describe('ISO 3166-1 alpha-3 country code, "OTC", or "" for cryptocurrency.'),
  }).strict()).optional().describe("Look up prices for the given stock symbols."),
  time: z.array(z.object({
    utc_offset: z.string().describe('UTC offset formatted like "+03:00".'),
  }).strict()).optional().describe("Get time for the given UTC offsets."),
  response_length: z.enum(["short", "medium", "long"]).optional().describe("Set the length of the response to be returned."),
}).strict();

export type SearchCommands = z.infer<typeof commands>;

export const options = z.object({
  web_search: z.enum(["cached", "indexed", "live"]).default("cached"),
  web_search_config: z.object({
    user_location: z.object({
      country: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      timezone: z.string().optional(),
    }).strict().optional(),
    search_context_size: z.enum(["low", "medium", "high"]).optional(),
    filters: z.object({ allowed_domains: z.array(z.string()).optional() }).strict().optional(),
  }).strict().optional(),
  tool_output_token_limit: unsigned.default(10000),
}).strict();

export type SearchOptions = z.infer<typeof options>;

export function searchSettings(config: SearchOptions) {
  const settings = config.web_search_config;
  type Configuration = NonNullable<SearchOptions["web_search_config"]>;
  const result: Omit<Configuration, "user_location"> & {
    allowed_callers: string[];
    external_web_access: boolean | "indexed";
    user_location?: Configuration["user_location"] & { type: "approximate" };
  } = {
    allowed_callers: ["direct"],
    external_web_access: config.web_search === "indexed" ? "indexed" : config.web_search === "live",
  };
  if (settings?.user_location !== undefined) result.user_location = { type: "approximate", ...settings.user_location };
  if (settings?.search_context_size !== undefined) result.search_context_size = settings.search_context_size;
  if (settings?.filters !== undefined) result.filters = settings.filters;
  return result;
}
