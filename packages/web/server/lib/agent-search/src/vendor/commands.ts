import { z } from "zod";

export interface SearchQuery {
  q: string;
  recency?: number;
  domains?: string[];
}

export interface OpenOperation {
  ref_id: string;
  lineno?: number;
}

export interface ClickOperation {
  ref_id: string;
  id: number;
}

export interface FindOperation {
  ref_id: string;
  pattern: string;
}

export type ResponseLength = "short" | "medium" | "long";

const reference = z.string().trim().min(1);
const searchQuery = z.object({ q: reference, recency: z.number().int().nonnegative().optional(), domains: z.array(reference).optional() }).strict();
const operations = <T extends z.ZodType>(schema: T) => z.array(schema).min(1).optional();

// Command fields mirror codex-rs/codex-api/src/search.rs.
export const additionalCommands = z.object({
  literature_search_query: operations(searchQuery),
  image_query: operations(searchQuery),
  screenshot: operations(z.object({ ref_id: reference, pageno: z.number().int().nonnegative() }).strict()),
  finance: operations(z.object({ ticker: reference, type: z.enum(["equity", "fund", "crypto", "index"]), market: z.string().optional() }).strict()),
  weather: operations(z.object({ location: reference, start: z.string().optional(), duration: z.number().int().nonnegative().optional() }).strict()),
  sports: operations(z.object({
    tool: z.literal("sports").default("sports"), fn: z.enum(["schedule", "standings"]),
    league: z.enum(["nba", "wnba", "nfl", "nhl", "mlb", "epl", "ncaamb", "ncaawb", "ipl"]),
    team: z.string().optional(), opponent: z.string().optional(), date_from: z.string().optional(),
    date_to: z.string().optional(), num_games: z.number().int().nonnegative().optional(), locale: z.string().optional(),
  }).strict()),
  time: operations(z.object({ utc_offset: reference }).strict()),
});

export interface WebRunCommand extends z.infer<typeof additionalCommands> {
  search_query?: SearchQuery[];
  open?: OpenOperation[];
  click?: ClickOperation[];
  find?: FindOperation[];
  response_length?: ResponseLength;
}

export interface SearchToolRequest {
  query: string;
  recency?: number;
  domains?: string[];
  response_length?: ResponseLength;
}

export class InvalidCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommandError";
  }
}

export function validateSearchToolRequest(input: unknown): SearchToolRequest {
  if (typeof input !== "object" || input === null) {
    throw new InvalidCommandError("Search parameters must be a non-null object");
  }

  const obj = input as Record<string, unknown>;
  if (typeof obj.query !== "string" || !obj.query.trim()) {
    throw new InvalidCommandError("query must be a non-empty string");
  }

  const request: SearchToolRequest = { query: obj.query.trim() };
  if (obj.recency !== undefined) {
    if (typeof obj.recency !== "number") throw new InvalidCommandError("recency must be a number");
    request.recency = obj.recency;
  }
  if (obj.domains !== undefined) {
    if (!Array.isArray(obj.domains) || obj.domains.some((domain) => typeof domain !== "string" || !domain.trim())) {
      throw new InvalidCommandError("domains must be an array of non-empty strings");
    }
    request.domains = obj.domains.map((domain) => domain.trim());
  }
  if (obj.response_length !== undefined) {
    if (obj.response_length !== "short" && obj.response_length !== "medium" && obj.response_length !== "long") {
      throw new InvalidCommandError("response_length must be 'short', 'medium', or 'long'");
    }
    request.response_length = obj.response_length;
  }
  return request;
}

export function validateWebRunCommand(cmd: unknown): WebRunCommand {
  if (typeof cmd !== "object" || cmd === null) {
    throw new InvalidCommandError("Command must be a non-null object");
  }

  const obj = cmd as Record<string, unknown>;
  const validated: WebRunCommand = {};

  if ("search_query" in obj && obj.search_query !== undefined) {
    if (!Array.isArray(obj.search_query)) {
      throw new InvalidCommandError("search_query must be an array");
    }
    validated.search_query = obj.search_query.map((sq, idx) => {
      if (typeof sq !== "object" || sq === null || typeof (sq as { q?: unknown }).q !== "string") {
        throw new InvalidCommandError(`search_query[${idx}] must be an object with a string 'q' property`);
      }
      const item: SearchQuery = { q: (sq as { q: string }).q.trim() };
      if (!item.q) {
        throw new InvalidCommandError(`search_query[${idx}].q cannot be empty`);
      }
      if (typeof (sq as { recency?: unknown }).recency === "number") {
        item.recency = (sq as { recency: number }).recency;
      }
      if (Array.isArray((sq as { domains?: unknown }).domains)) {
        item.domains = (sq as { domains: string[] }).domains
          .filter((d) => typeof d === "string" && d.trim())
          .map((d) => d.trim());
      }
      return item;
    });
  }

  if ("open" in obj && obj.open !== undefined) {
    if (!Array.isArray(obj.open)) {
      throw new InvalidCommandError("open must be an array");
    }
    validated.open = obj.open.map((op, idx) => {
      if (typeof op !== "object" || op === null || typeof (op as { ref_id?: unknown }).ref_id !== "string") {
        throw new InvalidCommandError(`open[${idx}] must be an object with a string 'ref_id' property`);
      }
      const item: OpenOperation = { ref_id: (op as { ref_id: string }).ref_id.trim() };
      if (!item.ref_id) {
        throw new InvalidCommandError(`open[${idx}].ref_id cannot be empty`);
      }
      if (typeof (op as { lineno?: unknown }).lineno === "number") {
        item.lineno = (op as { lineno: number }).lineno;
      }
      return item;
    });
  }

  if ("click" in obj && obj.click !== undefined) {
    if (!Array.isArray(obj.click)) {
      throw new InvalidCommandError("click must be an array");
    }
    validated.click = obj.click.map((cl, idx) => {
      if (
        typeof cl !== "object" ||
        cl === null ||
        typeof (cl as { ref_id?: unknown }).ref_id !== "string" ||
        typeof (cl as { id?: unknown }).id !== "number"
      ) {
        throw new InvalidCommandError(
          `click[${idx}] must be an object with a string 'ref_id' and numeric 'id'`
        );
      }
      const item: ClickOperation = {
        ref_id: (cl as { ref_id: string }).ref_id.trim(),
        id: (cl as { id: number }).id,
      };
      if (!item.ref_id) {
        throw new InvalidCommandError(`click[${idx}].ref_id cannot be empty`);
      }
      return item;
    });
  }

  if ("find" in obj && obj.find !== undefined) {
    if (!Array.isArray(obj.find)) {
      throw new InvalidCommandError("find must be an array");
    }
    validated.find = obj.find.map((fn, idx) => {
      if (
        typeof fn !== "object" ||
        fn === null ||
        typeof (fn as { ref_id?: unknown }).ref_id !== "string" ||
        typeof (fn as { pattern?: unknown }).pattern !== "string"
      ) {
        throw new InvalidCommandError(
          `find[${idx}] must be an object with string 'ref_id' and 'pattern'`
        );
      }
      const item: FindOperation = {
        ref_id: (fn as { ref_id: string }).ref_id.trim(),
        pattern: (fn as { pattern: string }).pattern,
      };
      if (!item.ref_id) {
        throw new InvalidCommandError(`find[${idx}].ref_id cannot be empty`);
      }
      return item;
    });
  }

  if ("response_length" in obj && obj.response_length !== undefined) {
    const rl = obj.response_length;
    if (rl !== "short" && rl !== "medium" && rl !== "long") {
      throw new InvalidCommandError("response_length must be 'short', 'medium', or 'long'");
    }
    validated.response_length = rl;
  }

  const extra = additionalCommands.parse(obj);
  const hasOperations =
    (validated.search_query && validated.search_query.length > 0) ||
    (validated.open && validated.open.length > 0) ||
    (validated.click && validated.click.length > 0) ||
    (validated.find && validated.find.length > 0) ||
    Object.values(extra).some(value => value && value.length > 0);

  if (!hasOperations) {
    throw new InvalidCommandError("Command must contain at least one operation");
  }

  Object.assign(validated, extra);

  return validated;
}

export interface EndpointPayloadOptions {
  sessionId?: string;
  model?: string;
  input?: SearchInputMessage[];
  settings?: SearchSettings;
  max_output_tokens?: number;
}

export interface SearchInputMessage {
  type: "message";
  role: "user" | "assistant";
  content: Array<{ type: "input_text" | "output_text"; text: string }>;
}

export interface SearchSettings {
  external_web_access?: boolean | "indexed";
  search_context_size?: "low" | "medium" | "high";
  user_location?: { type: "approximate"; country?: string; region?: string; city?: string; timezone?: string };
  filters?: { allowed_domains?: string[]; blocked_domains?: string[] };
  allowed_callers?: ["direct"];
}

export function serializeWebRunPayload(command: WebRunCommand, options?: EndpointPayloadOptions): Record<string, unknown> {
  const commandsObj: Record<string, unknown> = {};

  if (command.search_query && command.search_query.length > 0) {
    commandsObj.search_query = command.search_query;
  }
  if (command.open && command.open.length > 0) {
    commandsObj.open = command.open;
  }
  if (command.click && command.click.length > 0) {
    commandsObj.click = command.click;
  }
  if (command.find && command.find.length > 0) {
    commandsObj.find = command.find;
  }
  if (command.response_length) {
    commandsObj.response_length = command.response_length;
  }
  Object.assign(commandsObj, additionalCommands.parse(command));

  return {
    id: options?.sessionId ?? "search_1",
    model: options?.model ?? "gpt-4o",
    commands: commandsObj,
    ...(options?.input ? { input: options.input } : {}),
    ...(options?.settings ? { settings: options.settings } : {}),
    ...(options?.max_output_tokens !== undefined ? { max_output_tokens: options.max_output_tokens } : {}),
  };
}
