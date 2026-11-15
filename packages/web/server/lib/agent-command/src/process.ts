import os from "node:os";
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
import type { IPty } from "node-pty";

interface CommandSpawnOptions {
  command: string;
  workdir: string;
  login: boolean;
  env: NodeJS.ProcessEnv;
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

export async function prepareCommandSpawn() {
  const provider = await loadTerminalPtyProvider();
  return ({
    command,
    workdir,
    login,
    env: inheritedEnv,
  }: CommandSpawnOptions) => {
    const shellExecutable = commandShell();
    const shell = buildCommandShellLaunch(shellExecutable, command, login);
    const launch = resolvePosixPtyLaunch(shell.executable, shell.args);
    const env: NodeJS.ProcessEnv = {
      ...inheritedEnv,
      TERM: "xterm-256color",
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
    const terminal: Pick<IPty, "pid" | "write" | "onData" | "onExit" | "kill"> =
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
