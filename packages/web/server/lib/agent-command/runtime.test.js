import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../agent-tool/runtime.js';
import { materializeCommandPlugin } from '../opencode/agent-tool-plugin.js';
import { resolveOpenCodeMcpContext } from '../opencode/mcp-context.js';
import { setImmediate } from 'node:timers/promises';
import { TerminalManager } from './dist/terminal-manager.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const nodeCommand = (script) => `${quote(process.execPath)} -e ${quote(script)}`;
let root;
let server;
let runtime;
let tools;
let approvals;
let childEnv;
let hasPendingInput;
let registered;
let nativeClient;
let nativeTransport;
let mcpConfig;
const context = { sessionID: 'session-a', agent: 'build', messageID: 'message-a', id: 'call-a', progress: async () => {}, signal: new AbortController().signal };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-command-'));
  const app = express();
  hasPendingInput = vi.fn(async () => false);
  runtime = createAgentToolRuntime({ resolveMcpContext: resolveOpenCodeMcpContext,
    crypto,
    getActivePort: () => server.address().port,
    resolveSessionDirectory: async (id) => id.startsWith('session-') ? root : null,
    getCommandEnvironment: () => ({ ...process.env, COMMAND_TOOL_CONFIGURED_ENV: 'configured' }),
    hasPendingInput,
    permissions: { session: async sessionID => ({ directory: root, projectDirectory: root, assert: async input => approvals({ ...input, sessionID }) }) },
  });
  runtime.registerRoutes(app, express);
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  childEnv = runtime.createChildEnv();
  for (const [key, value] of Object.entries(childEnv)) vi.stubEnv(key, value);
  const directory = await materializeCommandPlugin(root);
  const plugin = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  approvals = vi.fn(async () => {});
  registered = new Map([['shell', {}]]);
  const transforms = [];
  await plugin.default.setup({
    location: { directory: root }, permission: { assert: approvals },
    tool: { transform: async transform => transforms.push(transform) },
    mcp: { transform: async transform => transform({ set: (name, config) => { mcpConfig = { name, ...config }; } }) },
  });
  nativeClient = new Client({ name: 'opencode', version: '2.3.2' });
  nativeTransport = new StreamableHTTPClientTransport(new URL(mcpConfig.url), { requestInit: { headers: mcpConfig.headers } });
  await nativeClient.connect(nativeTransport);
  const catalog = await nativeClient.listTools();
  tools = new Map(registered);
  for (const tool of catalog.tools) {
    tools.set(tool.name, {
      ...tool, input: tool.inputSchema,
      async execute(input, caller) {
        const event = { ...caller, tool: mcpConfig.name + '_' + tool.name, input };
        const response = await mcpCall(nativeClient, tool.name, event.input, caller);
        if (response.isError) throw new Error(response.content.map(part => part.text).join('\n'));
        const result = { output: response.structuredContent, content: response.content };
        return result;
      },
    });
  }
  for (const transform of transforms) transform({ remove: id => { registered.delete(id); tools.delete(id); }, update: (id, change) => change(tools.get(id.slice(mcpConfig.name.length + 1))) });
});

afterEach(async () => {
  await nativeTransport.terminateSession();
  await nativeClient.close();
  vi.useRealTimers();
  await runtime.closeCommands();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const run = async (name, input, caller = context) => (await tools.get(name).execute(input, caller)).output;
const enqueueInput = async sessionID => {
  runtime.observeCommandEvent({ type: 'session.inbox.enqueued', data: { sessionID } });
  await setImmediate();
};
const withMcpClient = async use => {
  const client = new Client({ name: 'command-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/api/openchamber/command-tool/mcp', childEnv.OPENCHAMBER_AGENT_TOOL_URL), {
    requestInit: { headers: { authorization: `Bearer ${childEnv.OPENCHAMBER_AGENT_TOOL_TOKEN}` } },
  });
  try {
    await client.connect(transport);
    return await use(client);
  } finally {
    try { await transport.terminateSession(); }
    finally { await client.close(); }
  }
};
const mcpCall = (client, name, input, caller = context) => client.callTool({
  name, arguments: input, _meta: { 'ai.opencode/sessionID': caller.sessionID },
}, undefined, { signal: caller.signal });

describe('managed command tools', () => {
  it('exposes the command contracts and structured results through MCP', async () => {
    await withMcpClient(async client => {
      const catalog = await client.listTools();
      expect(catalog.tools.map(tool => tool.name)).toEqual(['exec_command', 'write_stdin', 'clock_sleep', 'store', 'load']);
      for (const tool of catalog.tools) {
        expect(tool.description).toBe(tools.get(tool.name).description);
        expect(tool.inputSchema.required).toEqual(tools.get(tool.name).input.required);
        expect(tool.inputSchema.properties).not.toHaveProperty('sessionID');
        expect(tool.outputSchema.type).toBe('object');
      }
      const value = { text: '引号 "OK"、反斜杠 \\ 和换行\n第二行', nested: { value: 7 } };
      const result = await mcpCall(client, 'exec_command', { cmd: nodeCommand(`console.log(${JSON.stringify(JSON.stringify(value))})`) });
      expect(result.structuredContent).toMatchObject({ status: 'completed', exit_code: 0 });
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      expect(JSON.parse(result.structuredContent.output)).toEqual(value);
    });
  });

  it('shares command handles across MCP connections while isolating sessions', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('process.stdin.pipe(process.stdout)'), yield_time_ms: 0 });
    await withMcpClient(async client => {
      const denied = await mcpCall(client, 'write_stdin', { session_id: started.session_id, chars: 'other' }, { ...context, sessionID: 'session-b' });
      expect(denied.isError).toBe(true);
      const result = await mcpCall(client, 'write_stdin', { session_id: started.session_id, chars: '完整内容 "OK"\\\n', close_stdin: true, yield_time_ms: 5000 });
      expect(result.structuredContent).toMatchObject({ status: 'completed', exit_code: 0, output: '完整内容 "OK"\\' });
      const retained = await run('write_stdin', { session_id: started.session_id, offset: -1 });
      expect(retained.output).toBe(result.structuredContent.output);
    });
  });

  it('cancels an MCP launch through the standard cancellation notification', async () => {
    await withMcpClient(async client => {
      const marker = path.join(root, 'mcp-launch-pid');
      const controller = new AbortController();
      const launching = mcpCall(client, 'exec_command', { cmd: nodeCommand(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000)`), yield_time_ms: 10000 }, { ...context, signal: controller.signal });
      const rejected = expect(launching).rejects.toThrow('MCP launch cancelled');
      let pid;
      await expect.poll(async () => {
        try { pid = Number(await fs.readFile(marker, 'utf8')); return true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
      }).toBe(true);
      controller.abort(new Error('MCP launch cancelled'));
      await rejected;
      await expect.poll(() => {
        try { process.kill(pid, 0); return false; }
        catch (error) { if (error.code !== 'ESRCH') throw error; return true; }
      }).toBe(true);
    });
  });

  it('returns structured command output for script continuations', async () => {
    const result = await tools.get('exec_command').execute({ cmd: nodeCommand('console.log("structured")') }, context);
    expect(result.output).toEqual(JSON.parse(result.content[0].text));
    expect(result.output).toMatchObject({ status: 'completed', exit_code: 0 });
  });

  it('exposes command execution and continuation through native MCP discovery', () => {
    expect([...registered.keys()]).toEqual([]);
    expect(mcpConfig).toMatchObject({ name: 'openchamber_commands', type: 'remote', codemode: false, oauth: false });
    expect([...tools.keys()]).toEqual(['exec_command', 'write_stdin', 'clock_sleep', 'store', 'load']);
    expect(tools.get('exec_command').input.required).toEqual(['cmd']);
    expect(tools.get('write_stdin').input.required).toEqual(['session_id']);
    expect(tools.get('clock_sleep').input.required).toEqual(['duration_ms']);
    expect(tools.get('exec_command').description).toContain('Set tty: true at launch');
    expect(tools.get('exec_command').input.properties.tty.description).toContain('write_stdin can supply input');
    expect(tools.get('write_stdin').description).toContain('session mode is fixed at launch');
    expect(tools.get('write_stdin').input.properties.close_stdin.default).toBe(false);
  });

  it('completes a clock sleep and reports elapsed time', async () => {
    const sleeping = tools.get('clock_sleep').execute({ duration_ms: 20 }, context);
    const result = await sleeping;
    expect(JSON.parse(result.content[0].text)).toEqual(result.output);
    expect(result.metadata).toMatchObject({ duration_ms: 20, interrupted: false });
    expect(result.metadata.wall_time_seconds).toBeGreaterThan(0);
  });

  it('wakes sleeping tools only for new input in their own session', async () => {
    const sleeping = tools.get('clock_sleep').execute({ duration_ms: 10000 }, context);
    await expect.poll(() => hasPendingInput.mock.calls.length).toBe(1);
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

  it.each([0, -1, 0.5, 43200001])('rejects unsupported sleep duration %s', async duration_ms => {
    await expect(tools.get('clock_sleep').execute({ duration_ms }, context)).rejects.toThrow();
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
    const piped = await run('exec_command', { cmd, yield_time_ms: 250 });
    expect(piped.status).toBe('running');
    expect(piped.output).toBe('{"stdin":false,"stdout":false,"stderr":false}');
    const closed = await run('write_stdin', { session_id: piped.session_id, close_stdin: true, yield_time_ms: 1000 });
    expect(closed).toMatchObject({ status: 'completed', exit_code: 0, output: 'stdin closed' });
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

  it('supplies pipe input and EOF together without terminal echo', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('let text=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", part => text += part); process.stdin.on("end", () => console.log("received:" + text))'), yield_time_ms: 250 });
    const result = await run('write_stdin', { session_id: started.session_id, chars: 'hello', close_stdin: true, yield_time_ms: 1000 });
    expect(result).toMatchObject({ status: 'completed', exit_code: 0, output: 'received:hello' });
  });

  it('keeps a pipe open across writes until explicit EOF', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('process.stdin.on("data", data => process.stdout.write("received:" + data)); process.stdin.on("end", () => console.log("EOF"))'), yield_time_ms: 250 });
    const first = await run('write_stdin', { session_id: started.session_id, chars: 'first\n', yield_time_ms: 250 });
    expect(first).toMatchObject({ status: 'running', output: 'received:first' });
    const last = await run('write_stdin', { session_id: started.session_id, chars: 'last\n', close_stdin: true, yield_time_ms: 1000 });
    expect(last).toMatchObject({ status: 'completed', output: 'received:last\nEOF' });
  });

  it('rejects pipe EOF for a PTY while keeping it writable', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('process.stdin.resume()'), tty: true, yield_time_ms: 250 });
    await expect(run('write_stdin', { session_id: started.session_id, close_stdin: true })).rejects.toThrow('only for pipe sessions');
    expect((await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 1000 })).status).toBe('completed');
  });

  it('cancels a blocked pipe write without terminating the command', async () => {
    const manager = new TerminalManager();
    try {
      const started = await manager.executeCommand(nodeCommand('setInterval(() => {}, 1000)'), 250, { workdir: root });
      const controller = new AbortController();
      const writing = manager.sendInputToProcess(started.pid, 'x'.repeat(512 * 1024), false, controller.signal);
      let settled = false;
      writing.then(() => { settled = true; }, () => { settled = true; });
      const failed = expect(writing).rejects.toThrow('Input wait cancelled');
      await setImmediate();
      expect(settled).toBe(false);
      controller.abort(new Error('Input wait cancelled'));
      await failed;
      expect(manager.getSession(started.pid)).not.toBeNull();
    } finally { await manager.close(); }
  });

  it('keeps EOF final and reports later writes without stopping the command runtime', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('process.stdin.on("end", () => console.log("EOF")); process.stdin.resume(); setInterval(() => {}, 1000)'), yield_time_ms: 250 });
    expect((await run('write_stdin', { session_id: started.session_id, close_stdin: true, yield_time_ms: 250 })).output).toBe('EOF');
    const warnings = vi.spyOn(process, 'emitWarning');
    try {
      for (let index = 0; index < 12; index++) {
        await expect(run('write_stdin', { session_id: started.session_id, chars: 'late' })).rejects.toThrow();
      }
      await setImmediate();
      expect(warnings.mock.calls.some(([warning]) => String(warning).includes('MaxListenersExceededWarning'))).toBe(false);
    } finally { warnings.mockRestore(); }
    expect((await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 1000 })).status).toBe('completed');
  });

  it.skipIf(process.platform === 'win32')('reports a child-closed input pipe while keeping command cancellation usable', async () => {
    const started = await run('exec_command', { cmd: `exec ${nodeCommand('require("fs").closeSync(0); console.log("ready"); setInterval(() => {}, 1000)')}`, shell: '/bin/sh', login: false, yield_time_ms: 250 });
    expect(started.output).toBe('ready');
    await expect(run('write_stdin', { session_id: started.session_id, chars: 'hello' })).rejects.toThrow();
    expect((await run('write_stdin', { session_id: started.session_id, chars: '\x03', yield_time_ms: 1000 })).status).toBe('completed');
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
    const endpoint = new URL('/api/openchamber/command-tool/mcp', childEnv.OPENCHAMBER_AGENT_TOOL_URL);
    expect((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
    await withMcpClient(async client => {
      const result = await mcpCall(client, 'exec_command', { cmd: 'touch invalid-file', yield_time_ms: -1 });
      expect(result.isError).toBe(true);
      await expect(fs.stat(path.join(root, 'invalid-file'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('keeps command handles across plugin materialization and retires them on session deletion', async () => {
    const started = await run('exec_command', { cmd: nodeCommand('setInterval(() => {}, 1000)'), yield_time_ms: 0 });
    await materializeCommandPlugin(root);
    expect((await run('write_stdin', { session_id: started.session_id, yield_time_ms: 0 })).status).toBe('running');
    await runtime.observeCommandEvent({ type: 'session.deleted', data: { sessionID: context.sessionID } });
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

  it('keeps JSON snapshots across MCP connections and clears only a deleted session', async () => {
    const values = [{ text: '你好 "OK"\\\n第二行', items: [1, false, null] }, 'text', [1, 2], null, false, 0, ''];
    for (const value of values) {
      expect(await run('store', { key: 'result', value })).toEqual({ key: 'result' });
      await withMcpClient(async client => {
        const result = await mcpCall(client, 'load', { key: 'result' });
        expect(result.structuredContent).toEqual({ value });
        expect(JSON.parse(result.content[0].text)).toEqual({ value });
        expect((await mcpCall(client, 'load', { key: 'result' }, { ...context, sessionID: 'session-b' })).isError).toBe(true);
      });
    }
    await run('store', { key: 'result', value: 'B' }, { ...context, sessionID: 'session-b' });
    runtime.observeCommandEvent({ type: 'session.deleted', data: { sessionID: context.sessionID } });
    await expect(run('load', { key: 'result' })).rejects.toThrow('No stored value');
    expect(await run('load', { key: 'result' }, { ...context, sessionID: 'session-b' })).toEqual({ value: 'B' });
  });

  it('ends a sleeping call when its application session is stopped', async () => {
    const sleeping = run('clock_sleep', { duration_ms: 30000 });
    const rejected = expect(sleeping).rejects.toThrow();
    await expect.poll(() => hasPendingInput.mock.calls.length).toBe(1);
    expect(runtime.abortSession(context.sessionID)).toBe(1);
    await rejected;
  });

  it('captures sustained output completely while keeping tool responses small', async () => {
    const result = await run('exec_command', { cmd: nodeCommand('process.stdout.write("x".repeat(2000000))'), yield_time_ms: 10000, max_output_tokens: 5 });
    expect(result.status).toBe('completed');
    expect(result.output).toMatch(/^x{10}…\d+ tokens truncated…x{10}$/);
    const retained = await run('write_stdin', { session_id: result.session_id, offset: -result.total_lines, max_output_tokens: 3000000 });
    expect(retained.output.replaceAll('\n', '').length).toBe(2000000);
  });
});
