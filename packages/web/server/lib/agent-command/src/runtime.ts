import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TerminalManager } from "./terminal-manager.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { truncateOutput } from "./output.js";
import { commandWait, continuationWait } from "./wait.js";
import { commandInput, stdinInput, commandTools, type CommandArguments, type CommandResult, type RuntimeResult, type CommandToolName, type CommandToolContext } from "./contracts.js";
import { createCommandMcpRuntime } from "./mcp.js";
import type { ResolveMcpContext } from "../../agent-tool/mcp-context.js";
import { createSleepClock } from "./sleep.js";
import { createSessionMemory } from "./session-memory.js";
import type { JsonValue } from "../../event-stream/contracts.js";
import { authorizeCommand } from './permissions.js';
import type { ToolPermissions } from '../../agent-tool/permissions.js';

const streamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["session.inbox.enqueued", "openchamber.session.input", "session.deleted"]), data: z.object({ sessionID: z.string() }) }),
  z.object({ type: z.enum(["connect", "disconnect", "error", "initial-error"]) }),
]);

interface CommandRuntimeOptions extends CallbackAuthorization {
  resolveSessionDirectory: (sessionID: string) => Promise<string | null>;
  getEnvironment?: (() => NodeJS.ProcessEnv) | undefined;
  hasPendingInput: (sessionID: string, signal: AbortSignal) => Promise<boolean>;
  resolveMcpContext: ResolveMcpContext;
  permissions: ToolPermissions;
}

interface CallbackRequest extends IncomingMessage {
  body: unknown;
}
interface CallbackResponse extends ServerResponse {
  status(code: number): CallbackResponse;
  json(body: { error: string }): CallbackResponse;
}
type CallbackHandler = (
  req: CallbackRequest,
  res: CallbackResponse,
  next: (error?: Error) => void,
) => void | CallbackResponse | Promise<void | CallbackResponse>;
interface CallbackApp {
  all(path: string, ...handlers: CallbackHandler[]): void;
}
interface CallbackParser {
  json(options: { limit: string }): CallbackHandler;
}
interface CallbackAuthorization {
  authorize(req: IncomingMessage): boolean;
  trackInflight(sessionID: string, controller: AbortController): () => void;
  abortSession(sessionID: string): number;
}

export function createCommandToolRuntime({
  resolveSessionDirectory,
  getEnvironment,
  hasPendingInput,
  authorize,
  trackInflight,
  resolveMcpContext,
  abortSession,
  permissions,
}: CommandRuntimeOptions) {
  let managers = new Map<string, TerminalManager>();
  let closed = false;
  let clock = createSleepClock({ hasPendingInput });
  const memory = createSessionMemory();
  const closeResources = async () => {
    const previous = managers;
    managers = new Map();
    await Promise.all([mcp.close(), ...[...previous.values()].map((manager) => manager.close())]);
  };

  const readResult = (
    manager: TerminalManager,
    pid: number,
    input: { offset?: number | undefined; length?: number | undefined; max_output_tokens: number },
  ): CommandResult => {
    const result = manager.readOutputPaginated(
      pid,
      input.offset ?? 0,
      input.length ?? Number.MAX_SAFE_INTEGER,
    );
    if (!result) throw new Error("Command session not found");
    const preview = truncateOutput(result.lines.join("\n"), input.max_output_tokens);
    const response: CommandResult = {
      status: result.isComplete ? "completed" : "running",
      session_id: String(pid),
      output: preview.output,
      truncated:
        result.remaining > 0 ||
        preview.truncated ||
        (result.evictedLines ?? 0) > 0,
      read_from: result.readFrom,
      total_lines: result.totalLines,
    };
    if (result.isComplete) {
      response.exit_code = result.exitCode;
      if (result.signal) response.signal = result.signal;
    }
    return response;
  };

  const reset = () => {
    closed = false;
    clock.close();
    clock = createSleepClock({ hasPendingInput });
    void closeResources().catch((error) =>
      console.error("[agent-command] process cleanup failed:", error.message),
    );
  };

  const execute = async (
    tool: CommandToolName,
    input: CommandArguments,
    { sessionID, signal }: CommandToolContext,
  ): Promise<RuntimeResult> => {
    if (closed) throw new Error("Command runtime is closed");
    if (tool === "clock_sleep") return clock.sleep(commandTools.clock_sleep.input.parse(input), { sessionID, signal });
    if (tool === "store") return memory.store(commandTools.store.input.parse(input), sessionID);
    if (tool === "load") return memory.load(commandTools.load.input.parse(input), sessionID);
    if (tool === "exec_command") {
      const args = commandInput.parse(input);
      let manager = managers.get(sessionID);
      if (!manager) {
        manager = new TerminalManager({ getEnvironment });
        managers.set(sessionID, manager);
      }
      const directory = await resolveSessionDirectory(sessionID);
      if (!directory)
        throw new Error("Session directory is unavailable");
      args.workdir = await fs.realpath(
        path.resolve(directory, args.workdir ?? "."),
      );
      if (!(await fs.stat(args.workdir)).isDirectory())
        throw new Error("Working directory is not a directory");
      const started = await manager.executeCommand(
        args.cmd,
        commandWait(args.yield_time_ms),
        { workdir: args.workdir, login: args.login, tty: args.tty, shell: args.shell, signal },
      );
      signal?.throwIfAborted();
      return readResult(manager, started.pid, args);
    }
    const manager = managers.get(sessionID);
    if (!manager) throw new Error("Command session not found");
    const args = stdinInput.parse(input);
    const pid = Number(args.session_id);
    if ((args.chars || args.close_stdin) && manager.getSession(pid))
      await manager.sendInputToProcess(pid, args.chars, args.close_stdin, signal);
    if (args.offset === undefined || args.offset === 0)
      await manager.waitForOutput(pid, continuationWait(args.chars, args.yield_time_ms, args.close_stdin), signal);
    signal?.throwIfAborted();
    return readResult(manager, pid, args);
  };

  const mcp = createCommandMcpRuntime(async (tool, input, context) => {
    const controller = new AbortController();
    const untrack = trackInflight(context.sessionID, controller);
    try {
      const invocation = { sessionID: context.sessionID, signal: AbortSignal.any([context.signal, controller.signal]) };
      const approved = await authorizeCommand(permissions, tool, input, invocation);
      return await execute(tool, approved, invocation);
    } finally {
      untrack();
    }
  }, resolveMcpContext);

  const registerRoutes = (
    app: CallbackApp,
    express: CallbackParser,
  ) => {
    app.all(
      "/api/openchamber/command-tool/mcp",
      express.json({ limit: "1mb" }),
      async (req: CallbackRequest, res: CallbackResponse) => {
        if (!authorize(req)) return res.status(401).json({ error: "Unauthorized" });
        await mcp.handleRequest(req, res);
      },
    );
  };

  const releaseSession = async (id: string) => {
    abortSession(id);
    memory.clear(id);
    const manager = managers.get(id);
    if (!manager) return;
    await manager.close();
    managers.delete(id);
  };

  return {
    mcp,
    wait: async (sessionID: string) => { await managers.get(sessionID)?.wait(); },
    registerRoutes,
    reset,
    close: () => {
      closed = true;
      clock.close();
      memory.clearAll();
      return closeResources();
    },
    observeEvent: (payload: JsonValue) => {
      const parsed = streamEvent.safeParse(payload);
      if (!parsed.success) return;
      const event = parsed.data;
      if (event.type === "session.inbox.enqueued" || event.type === "openchamber.session.input") clock.interrupt(event.data.sessionID);
      if (event.type === "session.deleted") return releaseSession(event.data.sessionID)
        .catch(error => console.error("[agent-command] session cleanup failed:", error.message));
      if (event.type === "connect" && clock.signal.aborted) clock = createSleepClock({ hasPendingInput });
      if (event.type === "disconnect" || event.type === "error") clock.close(new Error("Input event stream failed"));
    },
  };
}
