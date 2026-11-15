import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { loadTerminalPtyProvider } from "../../terminal/runtime.js";
import {
  buildTerminalShellLaunch,
  getTerminalShellLoginArgs,
} from "../../terminal/shells.js";
import {
  stripAppImageArgv0Leak,
  stripAppImageLauncherEnv,
  resolvePosixPtyLaunch,
} from "../../inherited-env.js";

export interface CommandProcess {
  pid: number;
  write(input: string): void;
  onData(
    listener: (data: string, stream?: "stdout" | "stderr") => void,
  ): { dispose(): void };
  onExit(
    listener: (event: { exitCode: number | null; signal?: number }) => void,
  ): { dispose(): void };
  kill(signal?: NodeJS.Signals): void;
}

interface CommandLaunch {
  process: CommandProcess;
  shellExecutable: string;
  closeNative?: () => void;
}

interface CommandSpawnOptions {
  command: string;
  workdir: string;
  login: boolean;
  env: NodeJS.ProcessEnv;
  shell?: string;
}

export function commandShell() {
  if (process.platform === "win32") return "powershell.exe";
  const shell = os.userInfo().shell;
  if (shell === null) throw new Error("Account shell is unavailable");
  return shell;
}

export function buildCommandShellLaunch(
  shellExecutable: string,
  command: string,
  login: boolean,
) {
  const loginShell =
    login && getTerminalShellLoginArgs(shellExecutable) !== null;
  const shell = buildTerminalShellLaunch(shellExecutable, {
    mode: "command",
    command,
    loginShell,
  });
  const interactiveFlag = shell.args.slice(0, -1).indexOf("-i");
  if (interactiveFlag >= 0) shell.args.splice(interactiveFlag, 1);
  return shell;
}

async function spawnPipedCommand(
  executable: string,
  args: string[],
  workdir: string,
  env: NodeJS.ProcessEnv,
): Promise<CommandLaunch> {
  const child = spawn(executable, args, {
    cwd: workdir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const kill = (signal: NodeJS.Signals = "SIGTERM") => {
    const pid = child.pid!; // Called only for a successfully spawned process.
    if (process.platform === "win32") {
      const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
      if (result.error) throw result.error;
      if (result.status !== 0 && child.exitCode === null && child.signalCode === null)
        throw new Error(result.stderr.toString().trim());
      return;
    }
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
        throw error;
    }
  };
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const closed = new Promise<{ exitCode: number | null; signal?: number }>((resolve) => {
    child.once("exit", () => {
      // The command owns its process group, including shell background jobs.
      if (process.platform !== "win32") kill("SIGKILL");
      // Descendants can inherit the pipes after the command exits. Drain queued
      // output briefly without holding its completion open for those descendants.
      drainTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
      }, 50);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(drainTimer);
      resolve({ exitCode, signal: signal ? os.constants.signals[signal] : undefined });
    });
  });
  await once(child, "spawn");
  const pid = child.pid!; // The spawn event guarantees a process ID.
  const commandProcess: CommandProcess = {
    pid,
    write(input) {
      if (input !== "\x03")
        throw new Error("stdin is closed; start interactive commands with tty: true");
      kill("SIGINT");
    },
    onData(listener) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      const stdout = (text: string) => listener(text, "stdout");
      const stderr = (text: string) => listener(text, "stderr");
      child.stdout.on("data", stdout);
      child.stderr.on("data", stderr);
      return {
        dispose() {
          child.stdout.off("data", stdout);
          child.stderr.off("data", stderr);
        },
      };
    },
    onExit(listener) {
      let disposed = false;
      void closed.then(event => {
        if (!disposed) listener(event);
      });
      return { dispose() { disposed = true; } };
    },
    kill,
  };
  return { process: commandProcess, shellExecutable: executable };
}

export async function prepareCommandSpawn(tty: boolean) {
  const provider = tty ? await loadTerminalPtyProvider() : null;
  return ({
    command,
    workdir,
    login,
    env: inheritedEnv,
    shell: selectedShell,
  }: CommandSpawnOptions) => {
    const shellExecutable = selectedShell ?? commandShell();
    const shell = buildCommandShellLaunch(shellExecutable, command, login);
    const env: NodeJS.ProcessEnv = {
      ...inheritedEnv,
      TERM: tty ? "xterm-256color" : "dumb",
      AGENT: "1",
      OPENCODE: "1",
    };
    stripAppImageLauncherEnv(stripAppImageArgv0Leak(env));
    for (const key of [
      "NODE_CHANNEL_FD",
      "ELECTRON_RUN_AS_NODE",
      "OPENCHAMBER_AGENT_TOOL_TOKEN",
      "OPENCODE_PASSWORD",
      "OPENCODE_SERVER_PASSWORD",
    ])
      delete env[key];
    if (!provider)
      return spawnPipedCommand(shell.executable, shell.args, workdir, env);
    const launch = resolvePosixPtyLaunch(shell.executable, shell.args);
    const terminal: CommandProcess =
      provider.spawn(launch.executable, launch.args, {
        cwd: workdir,
        env,
        cols: 120,
        rows: 30,
      });
    return {
      process: terminal,
      shellExecutable,
      closeNative: () => {
        if (provider.backend === "bun-pty") terminal.kill();
      },
    };
  };
}
