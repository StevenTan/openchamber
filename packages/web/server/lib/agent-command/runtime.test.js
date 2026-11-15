import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../agent-tool/runtime.js';

const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const nodeCommand = (script) => `${quote(process.execPath)} -e ${quote(script)}`;
let root;
let server;
let runtime;
let tools;
let approvals;
let childEnv;
const context = { sessionID: 'session-a', agent: 'build', messageID: 'message-a', id: 'call-a', progress: async () => {} };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-command-'));
  const app = express();
  runtime = createAgentToolRuntime({
    crypto, fsPromises: fs, path, instanceDir: root,
    getActivePort: () => server.address().port,
    resolveSessionDirectory: async (id) => id.startsWith('session-') ? root : null,
    getCommandEnvironment: () => ({ ...process.env, COMMAND_TOOL_CONFIGURED_ENV: 'configured' }),
  });
  runtime.registerRoutes(app, express);
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  childEnv = runtime.createChildEnv();
  for (const [key, value] of Object.entries(childEnv)) vi.stubEnv(key, value);
  const directory = await runtime.materializeCommandPlugin();
  const plugin = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  approvals = vi.fn(async () => {});
  const registered = new Map([['shell', {}]]);
  await plugin.default.setup({
    location: { directory: root }, permission: { assert: approvals },
    tool: { transform: async transform => transform({ remove: id => registered.delete(id), add: tool => registered.set(tool.name, tool) }) },
  });
  tools = registered;
});

afterEach(async () => {
  await runtime.closeCommands();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const run = async (name, input, caller = context) => JSON.parse((await tools.get(name).execute(input, caller)).content);

describe('managed command tools', () => {
  it('exposes command execution and continuation as direct tools', () => {
    expect([...tools.keys()]).toEqual(['exec_command', 'write_stdin']);
    expect([...tools.values()].every(tool => tool.options.codemode === false)).toBe(true);
    expect(tools.get('exec_command').input.required).toEqual(['cmd']);
    expect(tools.get('write_stdin').input.required).toEqual(['session_id']);
  });

  it('captures standard output, errors, Unicode and the exit code', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('console.log("你好"); console.error("stderr"); process.exitCode=7'), yield_time_ms: 5000 });
    expect(result).toMatchObject({ status: 'completed', exit_code: 7, truncated: false });
    expect(result.output).toContain('你好');
    expect(result.output).toContain('stderr');
    expect(result.session_id).toMatch(/^\d+$/);
  });

  it('keeps a PTY alive across waits and sends input without adding a newline', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('console.log("ready"); process.stdin.once("data", data => { console.log("received:" + data.toString().trim()); process.exit(0) })'), yield_time_ms: 1000 });
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
    expect(performance.now() - before).toBeGreaterThanOrEqual(90);
    const result = await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 5000 });
    expect(result.status).toBe('completed');
  });

  it('scopes command handles to their OpenCode session', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('setInterval(() => {}, 1000)'), yield_time_ms: 0 });
    await expect(run('write_stdin', { session_id: started.session_id, yield_time_ms: 0 }, { ...context, sessionID: 'session-b' })).rejects.toThrow('Command session not found');
    await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 5000 });
  });

  it('retains output for paginated inspection after a truncated response', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('console.log("begin" + "x".repeat(100000) + "end")'), max_output_chars: 100, yield_time_ms: 5000 });
    expect(result.truncated).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(100);
    expect(result.output).toContain('end');
    const retained = await run('write_stdin', { session_id: result.session_id, offset: -1, max_output_chars: 200000 });
    expect(retained.output).toBe('begin' + 'x'.repeat(100000) + 'end\r');
  });

  it('enforces shell permission before executing a command', async () => {
    approvals.mockRejectedValueOnce(new Error('Denied'));
    await expect(run('exec_command', { cmd: 'touch denied-file' })).rejects.toThrow('Denied');
    await expect(fs.stat(path.join(root, 'denied-file'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(approvals).toHaveBeenCalledWith(expect.objectContaining({ action: 'shell', resources: ['touch denied-file'], sessionID: 'session-a' }));
  });

  it('requires permission for terminal input as well as its launch', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('process.stdin.resume()'), yield_time_ms: 0 });
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
    const result = await run('exec_command', { cmd: nodeCommand('process.stdout.write("😀".repeat(100))'), max_output_chars: 3, yield_time_ms: 5000 });
    expect(result.output).toBe('😀😀😀');
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
    const result = await run('exec_command', { cmd: nodeCommand('process.stdout.write("x".repeat(2000000))'), yield_time_ms: 10000, max_output_chars: 20 });
    expect(result.status).toBe('completed');
    expect(result.output).toBe('x'.repeat(20));
    const retained = await run('write_stdin', { session_id: result.session_id, offset: -result.total_lines, max_output_chars: 3000000 });
    expect(retained.output.replaceAll('\n', '').length).toBe(2000000);
  });
});
