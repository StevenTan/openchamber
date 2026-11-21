import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TerminalManager } from "./terminal-manager.js";
import { COMMAND_PLUGIN_ID, createCommandPluginSource } from "./plugin.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { truncateOutput } from "./output.js";
import { commandWait, continuationWait } from "./wait.js";

const waitTime = (value: number) =>
  z.number().int().min(0).default(value);
const outputLimit = z.number().int().min(0).default(10000);
const outputDescription =
  "Output token budget. Defaults to 10000 tokens, estimated at four UTF-8 bytes per token. Truncated responses retain the beginning and end; omission markers are additional. Inspect retained output with write_stdin using offset and length.";
const commandInput = z
  .object({
    cmd: z.string().min(1).describe("Shell command to execute."),
    workdir: z
      .string()
      .optional()
      .describe(
        "Working directory for the command. Defaults to the session's working directory.",
      ),
    yield_time_ms: waitTime(10000).describe(
      "Collect output until completion or this wait ends. Defaults to 10000 ms; effective range is 250-30000 ms, or 10000-30000 ms on Windows. Running commands continue after this wait.",
    ),
    max_output_tokens: outputLimit.describe(outputDescription),
    login: z
      .boolean()
      .default(true)
      .describe(
        "True starts a login shell when supported; false disables login mode. Defaults to true.",
      ),
    tty: z
      .boolean()
      .default(false)
      .describe("Set true at launch for programs that require a terminal. Defaults to false: stdin, stdout and stderr use pipes, and write_stdin can supply input. This mode is fixed for the session."),
    shell: z.string().min(1).optional().describe("Shell binary to launch. Defaults to the user's default shell."),
  })
  .strict();
const stdinInput = z
  .object({
    session_id: z
      .string()
      .min(1)
      .describe(
        "Session identifier returned by exec_command. Running sessions accept input and waits; completed sessions remain available for retained-output reads.",
      ),
    chars: z
      .string()
      .default("")
      .describe(
        "Characters to write to command stdin. Input is sent verbatim; include a newline to submit a line. Ctrl+C (U+0003) interrupts commands in either mode. Defaults to empty, which waits without writing unless close_stdin is true.",
      ),
    close_stdin: z.boolean().default(false).describe("Close a pipe session's stdin after sending chars, delivering EOF. Combine with the final input in one call, or use empty chars to send only EOF. Applies to tty: false sessions; PTY input uses terminal control characters."),
    yield_time_ms: z.number().int().min(0).optional().describe(
      "Collect output until completion or this wait ends. Non-empty writes default to 250 ms, with an effective range of 250-30000 ms. Empty waits default to 5000 ms, with a range of 5000-300000 ms. Output chunks do not end the wait. Absolute and tail reads return immediately.",
    ),
    max_output_tokens: outputLimit.describe(outputDescription),
    offset: z
      .number()
      .int()
      .optional()
      .describe(
        "Line offset in retained output. Omit or use 0 to continue from the previous read; positive offsets are absolute within the retained buffer, and negative offsets count from the end.",
      ),
    length: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Maximum number of output lines to read. Omit to select all available unread lines. The response also applies max_output_tokens.",
      ),
  })
  .strict();
const requestInput = z
  .object({
    sessionID: z.string().min(1),
    tool: z.enum(["exec_command", "write_stdin", "pending_input"]),
    input: z.unknown(),
  })
  .strict();

interface CommandRuntimeOptions {
  instanceDir: string;
  resolveSessionDirectory: (sessionID: string) => Promise<string | null>;
  getEnvironment?: (() => NodeJS.ProcessEnv) | undefined;
  hasPendingInput: (sessionID: string, signal: AbortSignal) => Promise<boolean>;
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
  exit_code?: number | null | undefined;
  signal?: number | string;
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
    const source = createCommandPluginSource({
      exec_command: z.toJSONSchema(commandInput, { io: "input" }),
      write_stdin: z.toJSONSchema(stdinInput, { io: "input" }),
      output: z.toJSONSchema(z.object({
        status: z.enum(["running", "completed"]),
        session_id: z.string(),
        output: z.string(),
        truncated: z.boolean(),
        read_from: z.number(),
        total_lines: z.number(),
        exit_code: z.number().nullable().optional(),
        signal: z.union([z.number(), z.string()]).optional(),
      })),
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
    void closeManagers().catch((error) =>
      console.error("[agent-command] process cleanup failed:", error.message),
    );
  };

  const execute = async (
    { sessionID, tool, input }: z.infer<typeof requestInput>,
    signal: AbortSignal,
  ) => {
    if (closed) throw new Error("Command runtime is closed");
    if (tool === "pending_input")
      return { pending: await hasPendingInput(sessionID, signal) };
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
