// Copyright (c) 2024-2025 Eduard Ruzga and Desktop Commander Contributors.
// Adapted from Desktop Commander src/terminal-manager.ts. MIT; see ../LICENSE.
import {
  analyzeProcessState,
  STATE_DETECTION_TAIL_CHARS,
} from "./process-detection.js";
import { prepareCommandSpawn } from "./process.js";
import { shutdownTerminalProcesses } from "../../terminal/shutdown.js";
import type { CommandProcess } from "./process.js";
import type { ProcessState } from "./process-detection.js";

interface CommandOptions {
  workdir: string;
  login?: boolean;
  tty?: boolean;
  shell?: string;
  signal?: AbortSignal;
}
interface ProcessStartResult {
  pid: number;
  isBlocked: boolean;
  processState: CommandProcessState;
}
interface CommandProcessState extends ProcessState {
  exitCode?: number | null;
  signal?: number;
}

/** A child process's output pipes. */
type OutputStream = "stdout" | "stderr";

/** The end of one output pipe, kept for process-state detection (see getProcessState). */
interface StreamTail {
  text: string; // Its last STATE_DETECTION_TAIL_CHARS chars
  chars: number; // Chars it has delivered since process start
  turn: number; // Event-loop turn that delivered its latest chunk (see currentDeliveryTurn)
}
interface StreamTails {
  stdout: StreamTail;
  stderr: StreamTail;
}

interface TerminalSession {
  pid: number;
  process: CommandProcess;
  outputLines: string[];
  lastReadIndex: number;
  lastReadOpenLine: string;
  startTime: Date;
  bufferedChars: number;
  evictedLines: number;
  evictedChars: number;
}
interface ManagedSession extends TerminalSession {
  streams: StreamTails;
  shellExecutable: string;
  closed: Promise<void>;
  completion: AbortSignal;
  termination?: Promise<void>;
}
interface CompletedSession {
  session: ManagedSession;
  exitCode: number | null;
  signal?: number;
  endTime: Date;
}
interface OutputSnapshot {
  streamChars: Record<OutputStream, number>;
}

// Result type for paginated output reading
interface PaginatedOutputResult {
  lines: string[];
  totalLines: number;
  readFrom: number; // Starting line of this read
  readCount: number; // Number of lines returned
  remaining: number; // Lines remaining after this read
  isComplete: boolean; // Whether process has finished
  exitCode?: number | null; // Exit code if completed
  signal?: number | undefined; // Signal that ended it, if completed by one (exitCode is then null)
  runtimeMs?: number; // Runtime in milliseconds (for completed processes)
  evictedLines?: number; // Lines dropped by the buffer cap; when > 0, line numbers are relative to the retained buffer
}

const OUTPUT_STREAMS: readonly OutputStream[] = ["stdout", "stderr"];
function newStreamTails(): StreamTails {
  return {
    stdout: { text: "", chars: 0, turn: 0 },
    stderr: { text: "", chars: 0, turn: 0 },
  };
}
const MAX_BUFFERED_OUTPUT_CHARS = 50 * 1024 * 1024;
const MAX_LINE_CHARS = 1024 * 1024;

export class TerminalManager {
  private sessions = new Map<number, ManagedSession>();
  private launches = new Set<Promise<ManagedSession>>();
  private completedSessions = new Map<number, CompletedSession>();
  private deliveryTurn = 0;
  private deliveryTurnOpen = false;
  private closing = false;
  private shutdown?: Promise<void>;
  private getEnvironment: () => NodeJS.ProcessEnv;

  constructor({
    getEnvironment = () => process.env,
  }: { getEnvironment?: () => NodeJS.ProcessEnv } = {}) {
    this.getEnvironment = getEnvironment;
    this.closing = false;
  }
  sendInputToProcess(pid: number, input: string): boolean {
    const session = this.sessions.get(pid);
    if (!session) return false;
    session.process.write(input);
    return true;
  }
  async executeCommand(
    command: string,
    timeoutMs = 10000,
    options: CommandOptions,
  ): Promise<ProcessStartResult> {
    const starting = this.startCommand(command, options);
    this.launches.add(starting);
    const session = await starting.finally(() => this.launches.delete(starting));
    const { signal } = options;
    try {
      await this.waitForOutput(session.pid, timeoutMs, signal);
      signal?.throwIfAborted();
    } catch (error) {
      if (signal?.aborted) await this.forceTerminate(session.pid);
      throw error;
    }
    return {
      pid: session.pid,
      isBlocked: this.sessions.has(session.pid),
      processState: this.getProcessState(session.pid)!,
    };
  }
  private async startCommand(
    command: string,
    { workdir, login = true, tty = false, shell, signal }: CommandOptions,
  ): Promise<ManagedSession> {
    const spawn = await prepareCommandSpawn(tty);
    signal?.throwIfAborted();
    if (this.closing) throw new Error("Command runtime is closed");
    const launched = spawn({ command, workdir, login, env: this.getEnvironment(), shell });
    // PTY listeners must attach in the spawn turn to capture short commands.
    const child = launched instanceof Promise ? await launched : launched;
    const {
      process: childProcess,
      shellExecutable,
      closeNative,
    } = child;
    if (signal?.aborted || this.closing) {
      const exited = new Promise<void>((resolve) => {
        const subscription = childProcess.onExit(() => {
          subscription.dispose();
          resolve();
        });
      });
      await shutdownTerminalProcesses([child], { graceMs: 0 });
      await exited;
      closeNative?.();
      signal?.throwIfAborted();
      throw new Error("Command runtime is closed");
    }
    let resolveClosed!: () => void;
    const completion = new AbortController();
    const session: ManagedSession = {
      pid: childProcess.pid,
      process: childProcess,
      outputLines: [],
      lastReadIndex: 0,
      lastReadOpenLine: "",
      startTime: new Date(),
      bufferedChars: 0,
      evictedLines: 0,
      evictedChars: 0,
      streams: newStreamTails(),
      shellExecutable,
      closed: new Promise((resolve) => {
        resolveClosed = resolve;
      }),
      completion: completion.signal,
    };
    this.sessions.set(childProcess.pid, session);
    const dataSubscription = childProcess.onData((data, stream = "stdout") => {
      this.recordOutput(session, stream, data);
    });
    const exitSubscription = childProcess.onExit(({ exitCode, signal: exitSignal }) => {
      dataSubscription.dispose();
      exitSubscription.dispose();
      closeNative?.();
      this.completedSessions.set(childProcess.pid, {
        session, exitCode, signal: exitSignal, endTime: new Date(),
      });
      if (this.completedSessions.size > 100) {
        const oldestKey = this.completedSessions.keys().next().value!;
        this.completedSessions.delete(oldestKey);
      }
      this.sessions.delete(childProcess.pid);
      completion.abort();
      resolveClosed();
    });
    return session;
  }
  private recordOutput(
    session: ManagedSession,
    stream: OutputStream,
    text: string,
  ): void {
    this.appendToLineBuffer(session, text);
    const tail = session.streams[stream];
    tail.text = (
      text.length >= STATE_DETECTION_TAIL_CHARS ? text : tail.text + text
    ).slice(-STATE_DETECTION_TAIL_CHARS);
    tail.chars += text.length;
    tail.turn = this.currentDeliveryTurn();
  }
  private currentDeliveryTurn(): number {
    if (!this.deliveryTurnOpen) {
      this.deliveryTurnOpen = true;
      this.deliveryTurn++;
      setImmediate(() => {
        this.deliveryTurnOpen = false;
      });
    }
    return this.deliveryTurn;
  }
  private appendToLineBuffer(session: TerminalSession, text: string): void {
    if (!text) return;

    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (session.outputLines.length === 0) {
        // First line ever
        session.outputLines.push(line);
      } else if (i === 0) {
        // First fragment - append to last line (might be partial)
        session.outputLines[session.outputLines.length - 1] += line;
      } else {
        // Subsequent lines - add as new lines
        session.outputLines.push(line);
      }
    }
    // Appended text contributes exactly its length to the joined buffer
    // (its newlines become the join separators).
    session.bufferedChars += text.length;

    // A process printing without newlines grows a single line forever, which
    // eviction can't bound — force-split so no line exceeds MAX_LINE_CHARS.
    // Each inserted break adds one separator to the joined length.
    let lastIndex = session.outputLines.length - 1;
    while (session.outputLines[lastIndex].length > MAX_LINE_CHARS) {
      const overlong = session.outputLines[lastIndex];
      session.outputLines[lastIndex] = overlong.slice(0, MAX_LINE_CHARS);
      session.outputLines.push(overlong.slice(MAX_LINE_CHARS));
      session.bufferedChars += 1;
      lastIndex++;
    }

    // Enforce the per-session cap by evicting the oldest lines. Keeps the
    // buffer far below V8's max string length so concatenation and join()
    // can never throw "Invalid string length" and kill the server.
    // Count them first and drop them with one splice: on an array this large
    // every shift() copies the whole array, and a line-by-line shift() stalled
    // the event loop for seconds per chunk once a session reached the cap.
    let evicted = 0;
    while (
      session.bufferedChars > MAX_BUFFERED_OUTPUT_CHARS &&
      evicted < session.outputLines.length - 1
    ) {
      const droppedJoinedChars = session.outputLines[evicted].length + 1; // +1 for its join separator
      session.bufferedChars -= droppedJoinedChars;
      session.evictedChars += droppedJoinedChars;
      evicted++;
    }
    if (evicted > 0) {
      session.outputLines.splice(0, evicted);
      session.evictedLines += evicted;
      session.lastReadIndex = Math.max(0, session.lastReadIndex - evicted);
    }
  }
  readOutputPaginated(
    pid: number,
    offset: number = 0,
    length: number = 1000,
  ): PaginatedOutputResult | null {
    // First check active sessions
    const session = this.sessions.get(pid);
    if (session) {
      const result = this.readFromLineBuffer(
        session,
        offset,
        length,
        false,
        undefined,
      );
      result.evictedLines = session.evictedLines;
      return result;
    }

    // Then check completed sessions: they keep their read position, so
    // reading on after the exit continues where the last read stopped
    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      const runtimeMs =
        completedSession.endTime.getTime() -
        completedSession.session.startTime.getTime();
      const result = this.readFromLineBuffer(
        completedSession.session,
        offset,
        length,
        true,
        completedSession.exitCode,
        runtimeMs,
      );
      result.evictedLines = completedSession.session.evictedLines;
      result.signal = completedSession.signal;
      return result;
    }

    return null;
  }
  private static openLineHasNewText(session: TerminalSession): boolean {
    const lines = session.outputLines;
    const openLine = lines[lines.length - 1] ?? "";
    return (
      openLine !== "" &&
      (lines.length - 1 !== session.lastReadIndex ||
        openLine !== session.lastReadOpenLine)
    );
  }
  private readFromLineBuffer(
    session: TerminalSession,
    offset: number,
    length: number,
    isComplete: boolean,
    exitCode?: number | null,
    runtimeMs?: number,
  ): PaginatedOutputResult {
    const lines = session.outputLines;
    // The empty last line after a trailing newline holds nothing: it isn't
    // counted (total, remaining, tail offsets) or returned. A last line with
    // text, unfinished or not, is.
    const totalLines =
      lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    let startIndex: number;
    let linesToRead: string[];
    let readableEnd = totalLines;

    if (offset < 0) {
      // Negative offset = start position from end, then read 'length' lines forward
      // e.g., offset=-50, length=10 means: start 50 lines from end, read 10 lines
      const fromEnd = Math.abs(offset);
      startIndex = Math.max(0, totalLines - fromEnd);
      linesToRead = lines.slice(
        startIndex,
        Math.min(startIndex + length, totalLines),
      );
      // Don't update lastReadIndex for tail reads
    } else if (offset === 0) {
      // offset=0 means "from where I last read" (like getNewOutput).
      // The last line is unfinished: output is appended to it until a newline
      // arrives. So it is returned only when it has text a read hasn't
      // returned, and the read position never moves past it: counting it as
      // read would lose whatever is appended to it next.
      const openLineIndex = Math.max(lines.length - 1, 0);
      readableEnd = TerminalManager.openLineHasNewText(session)
        ? lines.length
        : openLineIndex;
      startIndex = session.lastReadIndex;
      linesToRead = lines.slice(
        startIndex,
        Math.min(startIndex + length, readableEnd),
      );
      const readTo = startIndex + linesToRead.length;
      if (readTo === lines.length) {
        session.lastReadOpenLine = lines[lines.length - 1];
      }
      session.lastReadIndex = Math.min(readTo, openLineIndex);
    } else {
      // Positive offset = absolute position
      startIndex = offset;
      linesToRead = lines.slice(
        startIndex,
        Math.min(startIndex + length, totalLines),
      );
      // Don't update lastReadIndex for absolute position reads
    }

    const readCount = linesToRead.length;
    const endIndex = startIndex + readCount;
    const remaining = Math.max(0, readableEnd - endIndex);

    return {
      lines: linesToRead,
      totalLines,
      readFrom: startIndex,
      readCount,
      remaining,
      isComplete,
      exitCode,
      runtimeMs,
    };
  }
  getProcessState(
    pid: number,
    since?: OutputSnapshot,
  ): CommandProcessState | null {
    const session = this.sessions.get(pid);
    if (session) {
      return analyzeProcessState(
        TerminalManager.lastWrittenOutput(session.streams, since),
      );
    }
    const completedSession = this.completedSessions.get(pid);
    if (!completedSession) {
      return null;
    }
    const lastOutput = TerminalManager.lastWrittenOutput(
      completedSession.session.streams,
      since,
    ).join("\n");
    return {
      isWaitingForInput: false,
      isFinished: true,
      isRunning: false,
      lastOutput,
      exitCode: completedSession.exitCode,
      signal: completedSession.signal,
    };
  }
  private static lastWrittenOutput(
    streams: StreamTails,
    since?: OutputSnapshot,
  ): string[] {
    const recent = OUTPUT_STREAMS.map((name) => {
      const { text, chars, turn } = streams[name];
      const newChars = chars - (since?.streamChars[name] ?? 0);
      return { text: newChars > 0 ? text.slice(-newChars) : "", turn };
    }).filter((stream) => stream.text.length > 0);
    const lastTurn = Math.max(...recent.map((stream) => stream.turn));
    return recent
      .filter((stream) => stream.turn === lastTurn)
      .map((stream) => stream.text);
  }
  getSession(pid: number): ManagedSession | undefined {
    return this.sessions.get(pid);
  }
  async forceTerminate(pid: number): Promise<"not_found" | "terminated"> {
    const session = this.sessions.get(pid);
    if (!session) return "not_found";
    session.termination ??= shutdownTerminalProcesses([session], {
      graceMs: 0,
    }).then(() => session.closed);
    await session.termination;
    return "terminated";
  }
  close(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closing = true;
    this.shutdown = Promise.allSettled([...this.launches])
      .then(async () => {
        const active = [...this.sessions.values()];
        await shutdownTerminalProcesses(active, { graceMs: 0 });
        await Promise.all(active.map((session) => session.closed));
      })
      .then(() => {
        this.sessions.clear();
        this.completedSessions.clear();
      });
    return this.shutdown;
  }
  async waitForOutput(
    pid: number,
    waitMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    if (!this.getProcessState(pid))
      throw new Error("Command session not found");
    const session = this.getSession(pid);
    if (!session) return;
    await new Promise<void>((resolve, reject) => {
      let resolved = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        session.completion.removeEventListener("abort", resolveOnce);
        signal?.removeEventListener("abort", abort);
      };
      const resolveOnce = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve();
      };
      const abort = () => {
        resolved = true;
        cleanup();
        reject(signal?.reason);
      };
      timeout = setTimeout(resolveOnce, waitMs);
      session.completion.addEventListener("abort", resolveOnce, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
}
