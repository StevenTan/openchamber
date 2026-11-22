import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TerminalManager } from "./terminal-manager.js";
import { COMMAND_PLUGIN_ID, createCommandPluginSource } from "./plugin.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { truncateOutput } from "./output.js";
import { commandWait, continuationWait } from "./wait.js";
import { commandInput, stdinInput, type CommandArguments, type CommandResult, type CommandToolName, type CommandToolContext } from "./contracts.js";
import { createCommandMcpRuntime, type McpInvocation } from "./mcp.js";

const requestInput = z
  .object({
    sessionID: z.string().min(1),
    tool: z.literal("pending_input"),
    input: z.unknown(),
  })
  .strict();

interface CommandRuntimeOptions extends CallbackAuthorization {
  instanceDir: string;
  resolveSessionDirectory: (sessionID: string) => Promise<string | null>;
  getEnvironment?: (() => NodeJS.ProcessEnv) | undefined;
  hasPendingInput: (sessionID: string, signal: AbortSignal) => Promise<boolean>;
  resolveMcpSessionID: (request: McpInvocation) => string;
}

interface CallbackRequest extends IncomingMessage {
  body: unknown;
}
interface CallbackResponse extends ServerResponse {
  status(code: number): CallbackResponse;
  json(body: CommandResult | { pending: boolean } | { error: string }): CallbackResponse;
}
type CallbackHandler = (
  req: CallbackRequest,
  res: CallbackResponse,
  next: (error?: Error) => void,
) => void | CallbackResponse | Promise<void | CallbackResponse>;
interface CallbackApp {
  post(path: string, ...handlers: CallbackHandler[]): void;
  all(path: string, ...handlers: CallbackHandler[]): void;
}
interface CallbackParser {
  json(options: { limit: string }): CallbackHandler;
}
interface CallbackAuthorization {
  authorize(req: IncomingMessage): boolean;
  trackInflight(sessionID: string, controller: AbortController): () => void;
}

export function createCommandToolRuntime({
  instanceDir,
  resolveSessionDirectory,
  getEnvironment,
  hasPendingInput,
  authorize,
  trackInflight,
  resolveMcpSessionID,
}: CommandRuntimeOptions) {
  const pluginDirectory = path.join(
    instanceDir,
    "agent-tool",
    COMMAND_PLUGIN_ID,
  );
  let managers = new Map<string, TerminalManager>();
  let closed = false;
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

  const materializePlugin = async () => {
    const source = createCommandPluginSource();
    await fs.mkdir(pluginDirectory, { recursive: true });
    for (const [name, content] of [
      [
        "package.json",
        JSON.stringify({
          name: COMMAND_PLUGIN_ID,
          version: "0.0.0",
          private: true,
          type: "module",
          exports: { ".": "./index.js" },
        }) + "\n",
      ],
      ["index.js", source],
    ] as const) {
      const file = path.join(pluginDirectory, name);
      const previous = await fs
        .readFile(file, "utf8")
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
      if (previous !== content)
        await fs.writeFile(file, content, { mode: 0o600 });
    }
    return pluginDirectory;
  };

  const reset = () => {
    closed = false;
    void closeResources().catch((error) =>
      console.error("[agent-command] process cleanup failed:", error.message),
    );
  };

  const execute = async (
    tool: CommandToolName,
    input: CommandArguments,
    { sessionID, signal }: CommandToolContext,
  ): Promise<CommandResult> => {
    if (closed) throw new Error("Command runtime is closed");
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
      return await execute(tool, input, { sessionID: context.sessionID, signal: AbortSignal.any([context.signal, controller.signal]) });
    } finally {
      untrack();
    }
  }, resolveMcpSessionID);

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
    app.post(
      "/api/openchamber/command-tool",
      express.json({ limit: "1mb" }),
      async (req: CallbackRequest, res: CallbackResponse) => {
        if (!authorize(req))
          return res.status(401).json({ error: "Unauthorized" });
        const controller = new AbortController();
        const abort = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.once("close", abort);
        try {
          const payload = requestInput.parse(req.body);
          const untrack = trackInflight(payload.sessionID, controller);
          try {
            return res.json({ pending: await hasPendingInput(payload.sessionID, controller.signal) });
          } finally {
            untrack();
          }
        } catch (error) {
          if (!res.destroyed)
            return res.status(400).json({
              error: error instanceof Error ? error.message : String(error),
            });
        } finally {
          res.off("close", abort);
        }
      },
    );
  };

  return {
    materializePlugin,
    registerRoutes,
    reset,
    close: () => {
      closed = true;
      return closeResources();
    },
    releaseSession: async (id: string) => {
      const manager = managers.get(id);
      if (!manager) return;
      await manager.close();
      managers.delete(id);
    },
  };
}
