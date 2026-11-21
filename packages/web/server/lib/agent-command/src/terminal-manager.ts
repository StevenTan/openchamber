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
  shell?: string | undefined;
  signal?: AbortSignal;
}
interface ProcessStartResult {
  pid: number;
  isBlocked: boolean;
  processState: CommandProcessState | null;
}
interface CommandProcessState extends ProcessState {
  exitCode?: number | null | undefined;
  signal?: number | string | undefined;
}

type OutputStream = "stdout" | "stderr";

interface StreamTail {
  text: string;
  chars: number;
  turn: number;
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
  lastReadOpenLine: string | undefined;
  startTime: Date;
  bufferedChars: number;
  evictedLines: number;
  evictedChars: number;
}
interface ManagedSession extends TerminalSession {
  sendInput(input: string, closeStdin: boolean, signal?: AbortSignal): void | Promise<void>;
  streams: StreamTails;
  shellExecutable: string;
  closed: Promise<void>;
  completion: AbortSignal;
  termination?: Promise<void>;
}
interface CompletedSession {
  session: ManagedSession;
  exitCode: number | null;
  signal?: number | string | undefined;
  endTime: Date;
}
interface OutputSnapshot {
  streamChars: Record<OutputStream, number>;
}

interface PaginatedOutputResult {
  lines: string[];
  totalLines: number;
  readFrom: number;
  readCount: number;
  remaining: number;
  isComplete: boolean;
  exitCode?: number | null | undefined;
  signal?: number | string | undefined;
  runtimeMs?: number | undefined;
  evictedLines?: number;
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
  }: { getEnvironment?: (() => NodeJS.ProcessEnv) | undefined } = {}) {
    this.getEnvironment = getEnvironment;
    this.closing = false;
  }
  async sendInputToProcess(pid: number, input: string, closeStdin: boolean, signal?: AbortSignal): Promise<boolean> {
    const session = this.sessions.get(pid);
    if (!session) return false;
    await session.sendInput(input, closeStdin, signal);
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
      processState: this.getProcessState(session.pid),
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
    const child = launched instanceof Promise ? await launched : launched;
    const {
      process: childProcess,
      shellExecutable,
      closeNative,
      sendInput,
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
      sendInput,
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
        for (const oldestKey of this.completedSessions.keys()) {
          this.completedSessions.delete(oldestKey);
          break;
        }
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

    for (const [i, line] of lines.entries()) {

      if (session.outputLines.length === 0) {
        session.outputLines.push(line);
      } else if (i === 0) {
        session.outputLines.push(session.outputLines.pop() + line);
      } else {
        session.outputLines.push(line);
      }
    }
    session.bufferedChars += text.length;

    let lastIndex = session.outputLines.length - 1;
    let overlong = session.outputLines.slice(-1).join("");
    while (overlong.length > MAX_LINE_CHARS) {
      session.outputLines[lastIndex] = overlong.slice(0, MAX_LINE_CHARS);
      overlong = overlong.slice(MAX_LINE_CHARS);
      session.outputLines.push(overlong);
      session.bufferedChars += 1;
      lastIndex++;
    }

    let evicted = 0;
    for (const line of session.outputLines) {
      if (session.bufferedChars <= MAX_BUFFERED_OUTPUT_CHARS || evicted >= session.outputLines.length - 1) break;
      const droppedJoinedChars = line.length + 1;
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
    const totalLines =
      lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    let startIndex: number;
    let linesToRead: string[];
    let readableEnd = totalLines;

    if (offset < 0) {
      const fromEnd = Math.abs(offset);
      startIndex = Math.max(0, totalLines - fromEnd);
      linesToRead = lines.slice(
        startIndex,
        Math.min(startIndex + length, totalLines),
      );
    } else if (offset === 0) {
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
      startIndex = offset;
      linesToRead = lines.slice(
        startIndex,
        Math.min(startIndex + length, totalLines),
      );
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
