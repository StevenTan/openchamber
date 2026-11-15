import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TerminalManager } from "./terminal-manager.js";
import { COMMAND_PLUGIN_ID, createCommandPluginSource } from "./plugin.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const waitTime = (value: number) =>
  z.number().int().min(0).max(2147483647).default(value);
const outputLimit = z.number().int().min(1).default(16000);
const commandInput = z
  .object({
    cmd: z.string().min(1),
    workdir: z.string().optional(),
    yield_time_ms: waitTime(1000),
    max_output_chars: outputLimit,
    login: z.boolean().default(true),
  })
  .strict();
const stdinInput = z
  .object({
    session_id: z.string().min(1),
    chars: z.string().default(""),
    yield_time_ms: waitTime(10000),
    max_output_chars: outputLimit,
    offset: z.number().int().optional(),
    length: z.number().int().min(1).default(1000),
  })
  .strict();
const requestInput = z
  .object({
    sessionID: z.string().min(1),
    tool: z.enum(["exec_command", "write_stdin"]),
    input: z.unknown(),
  })
  .strict();

interface CommandRuntimeOptions {
  instanceDir: string;
  resolveSessionDirectory: (sessionID: string) => Promise<string | null>;
  getEnvironment?: () => NodeJS.ProcessEnv;
}

interface CallbackRequest extends IncomingMessage {
  body: unknown;
}
interface CommandResult {
  status: "running" | "completed";
  session_id: string;
  output: string;
  truncated: boolean;
  read_from: number;
  total_lines: number;
  exit_code?: number | null;
  signal?: number;
}
interface CallbackResponse extends ServerResponse {
  status(code: number): CallbackResponse;
  json(body: CommandResult | { error: string }): CallbackResponse;
}
type CallbackHandler = (
  req: CallbackRequest,
  res: CallbackResponse,
  next: (error?: Error) => void,
) => void | CallbackResponse | Promise<void | CallbackResponse>;
interface CallbackApp {
  post(path: string, ...handlers: CallbackHandler[]): void;
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
}: CommandRuntimeOptions) {
  const pluginDirectory = path.join(
    instanceDir,
    "agent-tool",
    COMMAND_PLUGIN_ID,
  );
  let managers = new Map<string, TerminalManager>();
  let closed = false;
  const closeManagers = async () => {
    const previous = managers;
    managers = new Map();
    await Promise.all([...previous.values()].map((manager) => manager.close()));
  };

  const readResult = (
    manager: TerminalManager,
    pid: number,
    input: { offset?: number; length?: number; max_output_chars: number },
  ): CommandResult => {
    const result = manager.readOutputPaginated(
      pid,
      input.offset ?? 0,
      input.length ?? 1000,
    );
    if (!result) throw new Error("Command session not found");
    const characters = [...result.lines.join("\n")];
    const response: CommandResult = {
      status: result.isComplete ? "completed" : "running",
      session_id: String(pid),
      output: characters.slice(-input.max_output_chars).join(""),
      truncated:
        result.remaining > 0 ||
        characters.length > input.max_output_chars ||
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
    const source = createCommandPluginSource({
      exec_command: z.toJSONSchema(commandInput, { io: "input" }),
      write_stdin: z.toJSONSchema(stdinInput, { io: "input" }),
    });
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
    ]) {
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
    void closeManagers().catch((error) =>
      console.error("[agent-command] process cleanup failed:", error.message),
    );
  };

  const execute = async (
    { sessionID, tool, input }: z.infer<typeof requestInput>,
    signal: AbortSignal,
  ) => {
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
        throw new Error("OpenCode session directory is unavailable");
      args.workdir = await fs.realpath(
        path.resolve(directory, args.workdir ?? "."),
      );
      if (!(await fs.stat(args.workdir)).isDirectory())
        throw new Error("Working directory is not a directory");
      const started = await manager.executeCommand(
        args.cmd,
        args.yield_time_ms,
        { workdir: args.workdir, login: args.login, signal },
      );
      signal?.throwIfAborted();
      return readResult(manager, started.pid, args);
    }
    const manager = managers.get(sessionID);
    if (!manager) throw new Error("Command session not found");
    const args = stdinInput.parse(input);
    const pid = Number(args.session_id);
    if (args.chars && manager.getSession(pid))
      manager.sendInputToProcess(pid, args.chars);
    if (args.offset === undefined || args.offset === 0)
      await manager.waitForOutput(pid, args.yield_time_ms, signal);
    signal?.throwIfAborted();
    return readResult(manager, pid, args);
  };

  const registerRoutes = (
    app: CallbackApp,
    express: CallbackParser,
    { authorize, trackInflight }: CallbackAuthorization,
  ) => {
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
            return res.json(await execute(payload, controller.signal));
          } finally {
            untrack();
          }
        } catch (error) {
          if (!res.destroyed)
            return res
              .status(400)
              .json({
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
      return closeManagers();
    },
    releaseSession: async (id: string) => {
      const manager = managers.get(id);
      if (!manager) return;
      await manager.close();
      managers.delete(id);
    },
  };
}
