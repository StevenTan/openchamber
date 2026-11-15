// Copyright (c) 2024-2025 Eduard Ruzga and Desktop Commander Contributors.
// Desktop Commander src/utils/process-detection.ts. MIT; see ../LICENSE.
/**
 * REPL and Process State Detection Utilities
 * Detects from its output whether a running process is waiting for input.
 * Whether it has finished is known from its exit, never from its output
 * (see TerminalManager.getProcessState).
 */

export interface ProcessState {
  isWaitingForInput: boolean;
  isFinished: boolean;
  isRunning: boolean;
  detectedPrompt?: string;
  lastOutput: string;
}

// Common REPL prompts. Most are generic ("... ", "> ", "+ ", "| "): inside or
// at the end of a longer line they are ordinary text (pytest -v's "collecting
// ... "; a markdown table's "| a | b |"), so they count only in a last
// line made of prompts alone: the prompt itself, the prompts a REPL that
// doesn't echo input printed one after another ("> | " from node -i), or,
// from a REPL that writes its prompts to stderr (python -i, bash -i), the
// prompts it wrote there (">>> ... ").
const REPL_PROMPTS = {
  python: [">>> ", "... "],
  node: ["> ", "... ", "| "],
  r: ["> ", "+ "],
  julia: ["julia> ", "       "], // julia continuation is spaces
  shell: ["$ ", "# ", "% "],
  mysql: ["mysql> ", "    -> "],
  postgres: ["=# ", "-# "],
  redis: ["redis> "],
  mongo: ["> ", "... "],
  powershell: [">> "],
};

const PROMPTS = [...new Set(Object.values(REPL_PROMPTS).flat())];
const PROMPTS_ONLY = new RegExp(
  `^(?:${PROMPTS.map(escapeRegExp).join("|")})+$`,
);

// Prompts that also count at the end of a longer line: named ones, after
// output that didn't end in a newline ("done>>> "), and a shell or psql
// prompt's end ("bash-5.2$ ", "user@host dir % ", "postgres=# ")
const LINE_END_PROMPTS = [
  ">>> ",
  "julia> ",
  "mysql> ",
  "redis> ",
  "$ ",
  "# ",
  "% ",
];

// PowerShell's prompt (powershell.exe, pwsh), at the end of a line: "PS ", a
// location (a drive, provider or path: "C:\Users\me", "/Users/me", "HKLM:\"),
// then "> " (">> " in a nested or debugger prompt, "[DBG]: PS C:\>> ")
const POWERSHELL_PROMPT_TEXT = String.raw`PS [^<>|\n]*[\\/:][^<>|\n]*>>? `;
const POWERSHELL_PROMPT = new RegExp(`${POWERSHELL_PROMPT_TEXT}$`);

// cmd.exe's prompt: the whole last line is a path and ">", with nothing after
// it ("C:\Users\me>"); output lines end in a newline, a prompt doesn't
const CMD_PROMPT_TEXT = String.raw`[A-Za-z]:\\[^<>|"*?\n]*>`;
const CMD_PROMPT = new RegExp(`^${CMD_PROMPT_TEXT}$`);

/** The prompt the last line of output is, or ends in, if any */
function findPrompt(lastLine: string): string | undefined {
  if (PROMPTS_ONLY.test(lastLine)) {
    return PROMPTS.find((prompt) => lastLine.endsWith(prompt));
  }
  const lineEnd = LINE_END_PROMPTS.find((prompt) => lastLine.endsWith(prompt));
  if (lineEnd) return lineEnd;
  if (POWERSHELL_PROMPT.test(lastLine) || CMD_PROMPT.test(lastLine))
    return "> ";
  return undefined;
}

/**
 * How much of the end of the output state detection examines. A prompt is
 * the last thing a process writes before it waits for input, so the end of
 * the output decides the state; examining only this much keeps detection's
 * cost the same however much output there is.
 */
export const STATE_DETECTION_TAIL_CHARS = 4096;

/**
 * Analyze a running process's output to determine whether it is waiting for
 * input. Output text never makes a process finished: a line such as
 * "Error: retrying" doesn't end it.
 *
 * `output` is what the process wrote most recently. For a process writing to
 * both stdout and stderr it can be the recent output of each stream that may
 * have written last (see TerminalManager.getProcessState): their relative
 * order is unknown, so the process is waiting for input if any of them ends
 * in a prompt. Only the last STATE_DETECTION_TAIL_CHARS of each are examined.
 */
export function analyzeProcessState(
  output: string | readonly string[],
): ProcessState {
  const tails = (typeof output === "string" ? [output] : output)
    .map((text) => text.slice(-STATE_DETECTION_TAIL_CHARS))
    .filter((text) => text.trim().length > 0);
  const states = tails.map(analyzeOutputTail);
  return (
    states.find((state) => state.isWaitingForInput) ?? {
      isWaitingForInput: false,
      isFinished: false,
      isRunning: true,
      lastOutput: tails.join("\n"),
    }
  );
}

/**
 * The state the end of one stream's output shows (see analyzeProcessState).
 */
function analyzeOutputTail(output: string): ProcessState {
  const lines = output.split("\n");
  const lastLine = lines[lines.length - 1] || "";

  // Check for REPL prompts (waiting for input)
  const detectedPrompt = findPrompt(lastLine);

  if (detectedPrompt) {
    return {
      isWaitingForInput: true,
      isFinished: false,
      isRunning: true,
      detectedPrompt,
      lastOutput: output,
    };
  }

  // Default: process is running, not waiting for input
  return {
    isWaitingForInput: false,
    isFinished: false,
    isRunning: true,
    lastOutput: output,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
