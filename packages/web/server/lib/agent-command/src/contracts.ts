import { z } from "zod";

import { AGENT_MCP_SERVERS } from "../../agent-tool/catalog.js";

export const COMMAND_MCP_SERVER = AGENT_MCP_SERVERS.commands.name;

const waitTime = (value: number) =>
  z.number().int().min(0).default(value);
const outputLimit = z.number().int().min(0).default(10000);
const outputDescription =
  "Output token budget. Defaults to 10000 tokens, estimated at four UTF-8 bytes per token. Truncated responses retain the beginning and end; omission markers are additional. Inspect retained output with write_stdin using offset and length.";
export const commandInput = z
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
export const stdinInput = z
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

export const commandOutput = z.object({
  status: z.enum(["running", "completed"]),
  session_id: z.string(),
  output: z.string(),
  truncated: z.boolean(),
  read_from: z.number(),
  total_lines: z.number(),
  exit_code: z.number().nullable().optional(),
  signal: z.union([z.number(), z.string()]).optional(),
});

export const commandTools = {
  exec_command: {
    description: "Runs a command with stdin, stdout and stderr pipes by default. Use write_stdin to send input; send EOF with close_stdin when the program needs the end of its input. Set tty: true at launch for programs that require a terminal. The session mode is fixed at launch. Collects output until the wait ends or the process exits, returning a session ID for continuation. When status is running, continue with write_stdin using the returned session_id. Completed commands retain their session_id for output inspection; status and exit_code report completion.",
    input: commandInput,
    output: commandOutput,
  },
  write_stdin: {
    description: "Writes characters to an existing command session and returns recent output. Pipe sessions accept ordinary input and close_stdin: true sends EOF after the supplied chars, so final input and EOF need one call. Empty chars without close_stdin waits without writing. Ctrl+C interrupts either mode. The session mode is fixed at launch. Use status to check completion; completed sessions remain readable through offset and length.",
    input: stdinInput,
    output: commandOutput,
  },
  clock_sleep: {
    description: "Pause execution for a specified duration. Pending input or new input in this session ends the sleep early. Returns elapsed wall-clock time and whether input interrupted the sleep.",
    input: z.object({ duration_ms: z.number().int().min(1).max(43200000).describe("How long to sleep in milliseconds.") }).strict(),
    output: z.object({ duration_ms: z.number(), wall_time_seconds: z.number(), interrupted: z.boolean() }),
  },
  store: {
    description: "Save a JSON value under a key in the current session's memory. Overwrites the same key. Values remain available across tool calls and conversation turns until the session is deleted or the server restarts. Returns the saved key. Await store before loading a dependent value.",
    input: z.object({ key: z.string().describe("Cache key within the current session."), value: z.json().describe("JSON value to save as a snapshot.") }).strict(),
    output: z.object({ key: z.string() }),
  },
  load: {
    description: "Read a JSON value saved by store in the current session. Returns { value: savedValue } with a copy of the saved value; call store to save edits. Throws a catchable tool error when the key does not exist. Other sessions' values are private. Memory is cleared when the session is deleted or the server restarts.",
    input: z.object({ key: z.string().describe("Cache key within the current session.") }).strict(),
    output: z.object({ value: z.json() }),
  },
};

export type CommandToolName = keyof typeof commandTools;
export type CommandArguments = z.input<typeof commandTools[CommandToolName]["input"]>;
export type CommandResult = z.infer<typeof commandOutput>;
export type RuntimeResult = z.infer<typeof commandTools[CommandToolName]["output"]>;
export interface CommandToolContext {
  sessionID: string;
  signal: AbortSignal;
}
