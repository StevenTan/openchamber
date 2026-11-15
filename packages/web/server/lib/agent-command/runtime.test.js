import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../agent-tool/runtime.js';
import { EventEmitter, on } from 'node:events';
import { setImmediate } from 'node:timers/promises';

const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const nodeCommand = (script) => `${quote(process.execPath)} -e ${quote(script)}`;
let root;
let server;
let runtime;
let tools;
let approvals;
let childEnv;
let cleanupPlugin;
let inputEvents;
let hasPendingInput;
const context = { sessionID: 'session-a', agent: 'build', messageID: 'message-a', id: 'call-a', progress: async () => {}, signal: new AbortController().signal };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-command-'));
  const app = express();
  inputEvents = new EventEmitter();
  hasPendingInput = vi.fn(async () => false);
  runtime = createAgentToolRuntime({
    crypto, fsPromises: fs, path, instanceDir: root,
    getActivePort: () => server.address().port,
    resolveSessionDirectory: async (id) => id.startsWith('session-') ? root : null,
    getCommandEnvironment: () => ({ ...process.env, COMMAND_TOOL_CONFIGURED_ENV: 'configured' }),
    hasPendingInput,
  });
  runtime.registerRoutes(app, express);
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  childEnv = runtime.createChildEnv();
  for (const [key, value] of Object.entries(childEnv)) vi.stubEnv(key, value);
  const directory = await runtime.materializeCommandPlugin();
  const plugin = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  approvals = vi.fn(async () => {});
  const registered = new Map([['shell', {}]]);
  cleanupPlugin = await plugin.default.setup({
    location: { directory: root }, permission: { assert: approvals },
    tool: { transform: async transform => transform({ remove: id => registered.delete(id), namespace: () => {}, add: tool => registered.set(tool.options.namespace ? `${tool.options.namespace}_${tool.name}` : tool.name, tool) }) },
    event: {
      async *subscribe({ signal }) {
        for await (const [event] of on(inputEvents, 'input', { signal })) yield event;
      },
    },
  });
  tools = registered;
});

afterEach(async () => {
  await cleanupPlugin();
  vi.useRealTimers();
  await runtime.closeCommands();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const run = async (name, input, caller = context) => JSON.parse((await tools.get(name).execute(input, caller)).content);
const enqueueInput = async sessionID => {
  inputEvents.emit('input', { type: 'session.inbox.enqueued', data: { sessionID } });
  await setImmediate();
};

describe('managed command tools', () => {
  it('exposes command execution and continuation as direct tools', () => {
    expect([...tools.keys()]).toEqual(['exec_command', 'write_stdin', 'clock_sleep']);
    expect([...tools.values()].every(tool => tool.options.codemode === false)).toBe(true);
    expect(tools.get('exec_command').input.required).toEqual(['cmd']);
    expect(tools.get('write_stdin').input.required).toEqual(['session_id']);
    expect(tools.get('clock_sleep').input.required).toEqual(['duration_ms']);
  });

  it('completes a clock sleep and reports elapsed time', async () => {
    const sleeping = tools.get('clock_sleep').execute({ duration_ms: 20 }, context);
    const result = await sleeping;
    expect(result.content).toContain('Sleep completed.');
    expect(result.metadata).toMatchObject({ duration_ms: 20, interrupted: false });
    expect(result.metadata.wall_time_seconds).toBeGreaterThan(0);
  });

  it('wakes sleeping tools only for new input in their own session', async () => {
    const sleeping = tools.get('clock_sleep').execute({ duration_ms: 10000 }, context);
    await enqueueInput('session-b');
    await enqueueInput(context.sessionID);
    expect((await sleeping).metadata.interrupted).toBe(true);
  });

  it('cancels a clock sleep when its tool call is aborted', async () => {
    const controller = new AbortController();
    const sleeping = tools.get('clock_sleep').execute({ duration_ms: 10000 }, { ...context, signal: controller.signal });
    const rejected = expect(sleeping).rejects.toThrow('Cancelled');
    controller.abort(new Error('Cancelled'));
    await rejected;
  });

  it('releases sleeping tools when the plugin unloads', async () => {
    const sleeping = tools.get('clock_sleep').execute({ duration_ms: 10000 }, context);
    const rejected = expect(sleeping).rejects.toThrow('Clock plugin unloaded');
    await cleanupPlugin();
    await rejected;
  });

  it.each([0, -1, 0.5, 43200001])('rejects unsupported sleep duration %s', async duration_ms => {
    await expect(tools.get('clock_sleep').execute({ duration_ms }, context)).rejects.toThrow('duration_ms must be between');
  });

  it('returns immediately for input already in the session inbox', async () => {
    hasPendingInput.mockResolvedValueOnce(true);
    const result = await tools.get('clock_sleep').execute({ duration_ms: 30000 }, context);
    expect(result.metadata.interrupted).toBe(true);
  });

  it('reports queue-query failures without leaving a sleep active', async () => {
    hasPendingInput.mockRejectedValueOnce(new Error('Inbox unavailable'));
    await expect(tools.get('clock_sleep').execute({ duration_ms: 30000 }, context)).rejects.toThrow('Inbox unavailable');
  });

  it('captures standard output, errors, Unicode and the exit code', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('console.log("你好"); console.error("stderr"); process.exitCode=7'), yield_time_ms: 5000 });
    expect(result).toMatchObject({ status: 'completed', exit_code: 7, truncated: false });
    expect(result.output).toContain('你好');
    expect(result.output).toContain('stderr');
    expect(result.session_id).toMatch(/^\d+$/);
  });

  it('runs the selected shell and checks its compound commands', async () => {
    const result = await run('exec_command', { cmd: 'printf %s "$BASH_VERSION"', shell: '/bin/bash', login: false });
    expect(result.output).toMatch(/^\d+\./);
    approvals.mockImplementation(async ({ resources }) => {
      if (resources.some(resource => resource.startsWith('rm '))) throw new Error('rm denied');
    });
    await expect(run('exec_command', { cmd: 'printf allowed; rm -f target', shell: '/bin/bash' })).rejects.toThrow('rm denied');
  });

  it('authorizes a selected executable independently from the command allowlist', async () => {
    const shell = path.join(root, 'custom-shell');
    await fs.writeFile(shell, '#!/bin/sh\ntouch denied-file\nexec /bin/sh "$@"\n', { mode: 0o755 });
    approvals.mockImplementation(async ({ resources }) => {
      if (!resources.every(resource => resource.startsWith('printf '))) throw new Error('Executable denied');
    });
    await expect(run('exec_command', { cmd: 'printf allowed', shell, login: false })).rejects.toThrow('Executable denied');
    await expect(fs.stat(path.join(root, 'denied-file'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('applies the token budget to UTF-8 output while retaining both ends', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('process.stdout.write("开头" + "😀".repeat(100) + "结尾")'), max_output_tokens: 4 });
    expect(result.output).toMatch(/^开头/);
    expect(result.output).toMatch(/结尾$/);
    expect(result.output).toContain('tokens truncated');
    expect(result.truncated).toBe(true);
  });

  it('uses pipes by default and exposes a terminal only when requested', async () => {
    const cmd = nodeCommand('console.log(JSON.stringify({ stdin: !!process.stdin.isTTY, stdout: !!process.stdout.isTTY, stderr: !!process.stderr.isTTY })); process.stdin.on("end", () => console.log("stdin closed")); process.stdin.resume()');
    const piped = await run('exec_command', { cmd, yield_time_ms: 5000 });
    expect(piped).toMatchObject({ status: 'completed', exit_code: 0 });
    expect(piped.output).toBe('{"stdin":false,"stdout":false,"stderr":false}\nstdin closed');
    const terminal = await run('exec_command', { cmd, tty: true, yield_time_ms: 500 });
    expect(terminal.output).toContain('{"stdin":true,"stdout":true,"stderr":true}');
    await run('write_stdin', { session_id: terminal.session_id, chars: '\x03', yield_time_ms: 5000 });
  });

  it('collects successive chunks until the command exits during a continuation', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('setTimeout(() => console.log("first"), 100); setTimeout(() => console.log("last"), 300)'), yield_time_ms: 0 });
    const result = await run('write_stdin', { session_id: started.session_id, yield_time_ms: 5000 });
    expect(result).toMatchObject({ status: 'completed', exit_code: 0 });
    expect([started.output, result.output].join('\n')).toBe('first\nlast');
  });

  it('collects launch output through completion even when it resembles a prompt', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('process.stdout.write("Password: "); setTimeout(() => console.log("done"), 150)'), yield_time_ms: 5000 });
    expect(result).toMatchObject({ status: 'completed', exit_code: 0, output: 'Password: done' });
  });

  it('rejects text input to a pipe session and keeps the command interruptible', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('setInterval(() => {}, 1000)'), yield_time_ms: 0 });
    await expect(run('write_stdin', { session_id: started.session_id, chars: 'hello\n' })).rejects.toThrow('stdin is closed');
    expect((await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 5000 })).status).toBe('completed');
  });

  it('finishes a command and terminates background jobs in its process group', async () => {
    let descendant;
    try {
      const result = await run('exec_command', { cmd: nodeCommand('const { spawn } = require("node:child_process"); const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", "inherit", "inherit"] }); console.log(child.pid); child.unref()'), yield_time_ms: 3000 });
      descendant = Number(result.output.trim());
      expect(result).toMatchObject({ status: 'completed', exit_code: 0 });
      expect(descendant).toBeGreaterThan(0);
      await expect.poll(() => {
        try { process.kill(descendant, 0); return false; }
        catch (error) { if (error.code !== 'ESRCH') throw error; return true; }
      }).toBe(true);
    } finally {
      if (descendant) { try { process.kill(descendant, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    }
  });

  it('terminates a launch when its tool call is cancelled', async () => {
    const marker = path.join(root, 'launch-pid');
    const controller = new AbortController();
    const launching = run('exec_command', { cmd: nodeCommand(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000)`), yield_time_ms: 10000 }, { ...context, signal: controller.signal });
    const rejected = expect(launching).rejects.toThrow('Launch cancelled');
    let pid;
    await expect.poll(async () => {
      try { pid = Number(await fs.readFile(marker, 'utf8')); return true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
    }).toBe(true);
    controller.abort(new Error('Launch cancelled'));
    await rejected;
    await expect.poll(() => {
      try { process.kill(pid, 0); return false; }
      catch (error) { if (error.code !== 'ESRCH') throw error; return true; }
    }).toBe(true);
  });

  it('keeps a PTY alive across waits and sends input without adding a newline', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('console.log("ready"); process.stdin.once("data", data => { console.log("received:" + data.toString().trim()); process.exit(0) })'), tty: true, yield_time_ms: 1000 });
    expect(started.status).toBe('running');
    expect(started.output).toContain('ready');
    const waiting = await run('write_stdin', { session_id: started.session_id, chars: 'hello', yield_time_ms: 20 });
    expect(waiting.status).toBe('running');
    expect(waiting.output).not.toContain('received:');
    const ended = await run('write_stdin', { session_id: started.session_id, chars: '\n', yield_time_ms: 5000 });
    expect(ended).toMatchObject({ status: 'completed', exit_code: 0 });
    expect(ended.output).toContain('received:hello');
    expect(ended.output).not.toContain('ready');
  });

  it('waits on the existing process and interrupts it with Ctrl+C', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('console.log("running"); setInterval(() => {}, 1000)'), yield_time_ms: 1000 });
    const before = performance.now();
    const waiting = await run('write_stdin', { session_id: started.session_id, yield_time_ms: 100 });
    expect(waiting.status).toBe('running');
    expect(waiting.output).toBe('');
    expect(performance.now() - before).toBeGreaterThanOrEqual(4900);
    const result = await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 5000 });
    expect(result.status).toBe('completed');
  });

  it('scopes command handles to their OpenCode session', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('setInterval(() => {}, 1000)'), yield_time_ms: 0 });
    await expect(run('write_stdin', { session_id: started.session_id, yield_time_ms: 0 }, { ...context, sessionID: 'session-b' })).rejects.toThrow('Command session not found');
    await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 5000 });
  });

  it('retains output for paginated inspection after a truncated response', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('console.log("begin" + "x".repeat(100000) + "end")'), max_output_tokens: 25, yield_time_ms: 5000 });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("tokens truncated");
    expect(result.output).toContain('begin');
    expect(result.output).toContain('end');
    const retained = await run('write_stdin', { session_id: result.session_id, offset: -1, max_output_tokens: 200000 });
    expect(retained.output).toBe('begin' + 'x'.repeat(100000) + 'end');
  });

  it('previews the beginning and end across all unread output lines', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('console.log("FIRST\\n" + "middle\\n".repeat(2000) + "LAST")'), max_output_tokens: 10, yield_time_ms: 5000 });
    expect(result.output).toMatch(/^FIRST\n/);
    expect(result.output).toMatch(/\nLAST$/);
    expect(result.truncated).toBe(true);
    const selected = await run('write_stdin', { session_id: result.session_id, offset: 2000, length: 2, max_output_tokens: 25 });
    expect(selected.output).toBe('middle\nLAST');
  });

  it('enforces shell permission before executing a command', async () => {
    approvals.mockRejectedValueOnce(new Error('Denied'));
    await expect(run('exec_command', { cmd: 'touch denied-file' })).rejects.toThrow('Denied');
    await expect(fs.stat(path.join(root, 'denied-file'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(approvals).toHaveBeenCalledWith(expect.objectContaining({ action: 'shell', resources: ['touch denied-file'], sessionID: 'session-a' }));
  });

  it('requires permission for terminal input as well as its launch', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('process.stdin.resume()'), tty: true, yield_time_ms: 0 });
    approvals.mockRejectedValueOnce(new Error('Input denied'));
    await expect(run('write_stdin', { session_id: started.session_id, chars: 'text\n' })).rejects.toThrow('Input denied');
  });

  it('rejects unauthenticated callbacks and invalid inputs', async () => {
    const endpoint = new URL('/api/openchamber/command-tool', childEnv.OPENCHAMBER_AGENT_TOOL_URL);
    expect((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${childEnv.OPENCHAMBER_AGENT_TOOL_TOKEN}` }, body: JSON.stringify({ sessionID: 'session-a', tool: 'exec_command', input: { cmd: 'touch invalid-file', yield_time_ms: -1 } }) });
    expect(response.status).toBe(400);
    await expect(fs.stat(path.join(root, 'invalid-file'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps command handles across plugin materialization and retires them on session deletion', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('setInterval(() => {}, 1000)'), yield_time_ms: 0 });
    await runtime.materializeCommandPlugin();
    expect((await run('write_stdin', { session_id: started.session_id, yield_time_ms: 0 })).status).toBe('running');
    await runtime.releaseCommandSession(context.sessionID);
    await expect(run('write_stdin', { session_id: started.session_id, yield_time_ms: 0 })).rejects.toThrow('Command session not found');
  });

  it('rejects a missing working directory and keeps subsequent commands usable', async () => {
    await expect(run('exec_command', { cmd: 'true', workdir: path.join(root, 'missing'), yield_time_ms: 5000 })).rejects.toThrow('ENOENT');
    expect((await run('exec_command', { cmd: 'printf usable', yield_time_ms: 5000 })).output).toBe('usable');
  });

  it('checks each command in compound statements and substitutions', async () => {
    approvals.mockImplementation(async ({ resources }) => {
      if (resources.some(resource => resource.startsWith('rm '))) throw new Error('rm denied');
    });
    await expect(run('exec_command', { cmd: 'printf allowed && rm -f target' })).rejects.toThrow('rm denied');
    await expect(run('exec_command', { cmd: 'printf "$(rm -f target)"' })).rejects.toThrow('rm denied');
    expect(approvals).toHaveBeenCalledWith(expect.objectContaining({ resources: ['rm -f target'] }));
  });

  it('uses configured command environment variables', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('console.log(process.env.COMMAND_TOOL_CONFIGURED_ENV)'), yield_time_ms: 5000 });
    expect(result.output.trim()).toBe('configured');
  });

  it('retains complete Unicode characters in a truncated preview', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('process.stdout.write("😀".repeat(100))'), max_output_tokens: 2, yield_time_ms: 5000 });
    expect(result.output).toBe('😀…98 tokens truncated…😀');
  });

  it('checks relative directory symlinks against the command working directory', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-command-outside-'));
    try {
      await fs.mkdir(path.join(root, 'workdir'));
      await fs.mkdir(path.join(root, 'child'));
      await fs.symlink(outside, path.join(root, 'workdir', 'child'));
      approvals.mockImplementation(async ({ action }) => { if (action === 'external_directory') throw new Error('External directory denied'); });
      await expect(run('exec_command', { cmd: 'cd child && pwd', workdir: 'workdir' })).rejects.toThrow('External directory denied');
    } finally { await fs.rm(outside, { recursive: true, force: true }); }
  });

  it('permits a command to create the directory it subsequently enters', async () => {
    const directory = path.join(root, 'created', 'nested');
    const result = await run('exec_command', { cmd: `mkdir -p ${quote(directory)} && cd ${quote(directory)} && pwd`, yield_time_ms: 5000 });
    expect(await fs.realpath(result.output.trim())).toBe(await fs.realpath(directory));
  });

  it('interrupts a command while another continuation is waiting', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('console.log("ready"); setInterval(() => {}, 1000)'), yield_time_ms: 1000 });
    expect(started.output).toContain('ready');
    const waiting = run('write_stdin', { session_id: started.session_id, yield_time_ms: 2000 });
    const before = performance.now();
    const interrupting = run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 1000 }).then(result => ({ result, elapsed: performance.now() - before }));
    const [finished, interrupted] = await Promise.all([waiting, interrupting]);
    expect(interrupted.elapsed).toBeLessThan(1500);
    expect(interrupted.result.status).toBe('completed');
    expect(finished.status).toBe('completed');
  });

  it('captures sustained output completely while keeping tool responses small', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('process.stdout.write("x".repeat(2000000))'), yield_time_ms: 10000, max_output_tokens: 5 });
    expect(result.status).toBe('completed');
    expect(result.output).toMatch(/^x{10}…\d+ tokens truncated…x{10}$/);
    const retained = await run('write_stdin', { session_id: result.session_id, offset: -result.total_lines, max_output_tokens: 3000000 });
    expect(retained.output.replaceAll('\n', '').length).toBe(2000000);
  });
});
