import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import type { AntigravityAuthentication } from '@openchamber/sdk/agent-backends';

interface Options {
  launch(): Promise<{ binary: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }>;
  verify(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  logout(): Promise<void>;
  hasCredentials(): boolean;
  changed(): void;
}

export function createAntigravityAuthentication(options: Options) {
  let state: AntigravityAuthentication = { phase: 'idle' };
  let child: ChildProcessWithoutNullStreams | undefined;
  let task: Promise<void> | undefined;
  let cancellation: AbortController | undefined;
  const update = (next: AntigravityAuthentication) => { state = next; options.changed(); };

  const run = async (signal: AbortSignal) => {
    await options.disconnect();
    const launch = await options.launch();
    signal.throwIfAborted();
    const { DISPLAY: _display, WAYLAND_DISPLAY: _wayland, ...env } = launch.env;
    child = spawn(launch.binary, [...launch.args, '--login'], { cwd: launch.cwd, env, stdio: 'pipe', signal });
    const exited = once(child, 'close');
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      const value = line.trim();
      if (value.startsWith('https://accounts.google.com/')) update({ phase: 'waiting', authorizationUrl: value });
    });
    child.stderr.resume();
    const [code] = await exited;
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`Antigravity sign-in exited with code ${code}.`);
    update({ phase: 'verifying' });
    await options.verify(signal);
    signal.throwIfAborted();
    update({ phase: 'succeeded' });
  };

  return {
    state: (): AntigravityAuthentication => state.phase === 'idle' && options.hasCredentials() ? { phase: 'succeeded' } : state,
    start() {
      cancellation = new AbortController();
      const controller = cancellation;
      update({ phase: 'starting' });
      const timeout = setTimeout(() => controller.abort(new Error('Antigravity sign-in timed out.')), 300_000);
      task = run(controller.signal).catch(cause => {
        if (state.phase !== 'cancelled') update({ phase: 'failed', message: cause instanceof Error ? cause.message : String(cause) });
      }).finally(() => clearTimeout(timeout));
      return state;
    },
    submit(code: string) {
      if (state.phase !== 'waiting' || !child) throw Object.assign(new Error('Antigravity is not waiting for a sign-in code.'), { status: 409 });
      update({ phase: 'verifying' });
      child.stdin.end(`${code}\n`);
      return state;
    },
    async cancel() {
      update({ phase: 'cancelled' });
      cancellation?.abort();
      await options.disconnect();
      await task;
      return state;
    },
    async logout() {
      await options.logout();
      update({ phase: 'idle' });
      return state;
    },
    async close() {
      cancellation?.abort();
      await task;
    },
  };
}
