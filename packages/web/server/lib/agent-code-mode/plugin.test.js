import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import { Effect, Exit, Schema, Scope } from 'effect';
import { materializeCodeModePlugin } from './runtime.js';
import { createAgentToolRuntime } from '../agent-tool/runtime.js';
import { createToolPermissions } from '../agent-tool/permissions.js';

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.unstubAllEnvs(); });

async function fixture(dependencies = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'code-mode-mcp-'));
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.symlink(new URL('../../../node_modules', import.meta.url), path.join(directory, 'node_modules'), 'dir');
  const permissions = [];
  const policy = createToolPermissions({ file: path.join(directory, 'permissions.json'),
    readPolicy: async () => ({ directory, projectDirectory: directory, rules: [{ action: '*', resource: '*', effect: 'allow' }, ...permissions] }), publish: () => {},
  });
  const captured = [];
  let listener;
  const runtime = createAgentToolRuntime({ crypto, fsPromises: fs, path, instanceDir: directory,
    resolveSessionDirectory: async () => directory, getActivePort: () => listener.address().port, permissions: policy,
    codeModeFileActivity: async (phase, request, tool, input) => { captured.push({ phase, source: request._meta?.['openchamber/source'], tool, input }); return {}; },
    ...dependencies,
  });
  const app = express();
  app.get('/page', (_req, res) => res.send('FETCH_BODY'));
  runtime.registerRoutes(app, express);
  listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  cleanup.push(async () => { await runtime.closeCommands(); await new Promise(resolve => listener.close(resolve)); });
  for (const [key, value] of Object.entries(runtime.createChildEnv())) vi.stubEnv(key, value);
  const client = new Client({ name: 'code-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL('/api/openchamber/code-mode/mcp', process.env.OPENCHAMBER_AGENT_TOOL_URL), {
    requestInit: { headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN } },
  });
  await client.connect(transport);
  cleanup.push(async () => { await transport.terminateSession(); await client.close(); });
  const tools = new Map((await client.listTools()).tools.map(tool => [`openchamber_${tool.name}`, { ...tool, id: `openchamber_${tool.name}`, input: tool.inputSchema, output: tool.outputSchema, options: { namespace: 'openchamber', codemode: false } }]));
  tools.set('native_probe', { id: 'native_probe', name: 'native_probe', input: Schema.Struct({}), options: { codemode: true }, execute: () => Effect.succeed({ content: 'NATIVE' }) });
  const sessionHooks = new Map(), toolHooks = new Map(), skills = [];
  const ctx = {
    location: { directory },
    mcp: { transform: run => Effect.sync(() => run({ set: (name, config) => { expect(name).toBe('openchamber'); expect(config.url).toContain('/code-mode/mcp'); } })) },
    skill: { list: () => Effect.succeed({ data: skills }) },
    tool: {
      transform: run => Effect.sync(() => run({ list: () => [...tools.values()], update: (id, change) => change(tools.get(id)) })),
      hook: (name, run) => Effect.sync(() => toolHooks.set(name, event => Effect.runPromise(run(event)))),
    },
    agent: { get: () => Effect.succeed({ data: { permissions: [{ action: '*', resource: '*', effect: 'allow' }] } }) },
    session: { get: () => Effect.succeed({ permissions }), hook: (name, run) => Effect.sync(() => { sessionHooks.set(name, event => Effect.runPromise(run(event))); }) },
  };
  const materialized = await materializeCodeModePlugin(directory);
  const { default: plugin } = await import(pathToFileURL(path.join(materialized, 'index.js')).href);
  const scope = await Effect.runPromise(Scope.make());
  cleanup.push(() => Effect.runPromise(Scope.close(scope, Exit.void)));
  await Effect.runPromise(plugin.effect(ctx).pipe(Effect.provideService(Scope.Scope, scope)));
  const progress = [];
  const run = (code, sessionID = 'session') => Effect.runPromise(tools.get('openchamber_execute').execute({ code }, {
    sessionID, agent: 'build', messageID: 'message', id: crypto.randomUUID(), progress: update => Effect.sync(() => progress.push(structuredClone(update))),
  }));
  const request = async (hook = 'context') => {
    const event = { sessionID: 'session', agent: 'build', tools: { execute: {}, openchamber_execute: {}, native_probe: {} }, messages: [],
      system: [{ type: 'text', text: 'OLD_CATALOG\nENVIRONMENT\nVIRTUAL_BODY', metadata: { experimental: { instructions: [{ key: 'core/codemode', text: 'OLD_CATALOG' }, { key: 'core/environment', text: 'ENVIRONMENT' }, { key: 'core/skill-guidance', text: 'VIRTUAL_BODY' }] } } }],
    };
    await sessionHooks.get(hook)(event);
    return event;
  };
  return { directory, client, tools, permissions, policy, skills, request, toolHooks, run, captured, progress, runtime, url: `http://127.0.0.1:${listener.address().port}/page` };
}

it('discovers execute through MCP with the complete shared catalog and keeps backend tools direct', async () => {
  const f = await fixture();
  const tool = (await f.client.listTools()).tools.find(tool => tool.name === 'execute');
  expect(tool.inputSchema).toMatchObject({ required: ['code'], properties: { code: { type: 'string' } } });
  for (const name of ['openchamber_commands.exec_command', 'file.patch', 'browser.click', 'request.user_input_async']) expect(tool.description).toContain(`tools.${name}(`);
  expect(tool.description).toContain('Direct tool entry: `file_patch`');
  expect(tool.description).not.toContain('native_probe');
  const event = await f.request();
  expect(event.tools).toEqual({ openchamber_execute: {}, native_probe: {} });
  expect(JSON.stringify(event.system)).toContain('ENVIRONMENT');
  expect(JSON.stringify(event.system)).not.toContain('OLD_CATALOG');
  expect(f.tools.get('native_probe').options.codemode).toBe(false);
  await f.runtime.materializePlugin({ includeWeb: false });
  expect((await f.client.listTools()).tools.find(tool => tool.name === 'execute').description).not.toContain('tools.browser.');
  expect((await f.run('return await tools.browser.snapshot({});')).output.ok).toBe(false);
});

it('runs shared MCP files and commands concurrently with structured output, progress and image attachments', async () => {
  const f = await fixture();
  const result = await f.run('return await Promise.all([tools.file.write({path:"probe.txt",content:"MCP_BODY"}), tools.openchamber_commands.exec_command({cmd:"printf command-proof",yield_time_ms:1000})]);');
  expect(result.output.ok).toBe(true);
  expect(result.output.value[1]).toMatchObject({ status: 'completed', output: 'command-proof', exit_code: 0 });
  expect(await fs.readFile(path.join(f.directory, 'probe.txt'), 'utf8')).toBe('MCP_BODY');
  expect(result.metadata.openchamberToolCalls).toMatchObject([{ tool: 'file_write', status: 'completed', metadata: { files: [{ file: 'probe.txt' }] } }, { tool: 'openchamber_commands_exec_command', status: 'completed' }]);
  expect(f.progress.some(update => update.toolCalls.some(call => call.status === 'running'))).toBe(true);
  expect(f.captured.map(event => event.phase)).toEqual(['before', 'after']);
  expect(f.captured[0].source).toMatchObject({ sessionID: 'session', messageID: 'message', directory: f.directory });
  const image = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP4z8AARGDiPwMAHfAD/aAzCYkAAAAASUVORK5CYII=';
  await fs.writeFile(path.join(f.directory, 'image.png'), Buffer.from(image, 'base64'));
  const viewed = await f.run('return await tools.file.view_image({path:"image.png"});');
  expect(viewed.content).toContainEqual({ type: 'file', mime: 'image/png', uri: `data:image/png;base64,${image}` });
});

it('shares control, schedule and terminal calls between direct MCP and scripts with session identity and permissions', async () => {
  const executeAction = vi.fn(async action => ({ action }));
  const f = await fixture({ executeAction });
  await f.runtime.materializePlugin({ includeControl: true, includeSchedule: true, includeTerminal: true });
  const tools = (await f.client.listTools()).tools;
  for (const name of ['control', 'schedule', 'terminal']) {
    expect(tools.map(tool => tool.name)).toContain(name);
    expect(tools.find(tool => tool.name === 'execute').description).toContain(`tools.openchamber.${name}(`);
  }
  const direct = await f.client.callTool({ name: 'control', arguments: { action: 'session.list' }, _meta: { 'ai.opencode/sessionID': 'session' } });
  expect(direct.structuredContent).toMatchObject({ ok: true, action: 'session.list' });
  const result = await f.run('return await Promise.allSettled([tools.openchamber.control({action:"session.list"}), tools.openchamber.schedule({action:"list"}), tools.openchamber.terminal({action:"list"})]);');
  expect(result.output.value.map(value => value.value.action)).toEqual(['session.list', 'schedule.list', 'terminal.list']);
  for (const [, , directory, options] of executeAction.mock.calls) {
    expect(directory).toBe(f.directory);
    expect(options).toMatchObject({ contextSessionId: 'session', contextCallId: expect.any(String), signal: expect.any(AbortSignal) });
  }
  expect(result.metadata.openchamberToolCalls.map(call => call.metadata.openchamber.action)).toEqual(['session.list', 'schedule.list', 'terminal.list']);
  f.permissions.push({ action: 'openchamber', resource: '*', effect: 'deny' });
  const count = executeAction.mock.calls.length;
  expect((await f.run('return await tools.openchamber.control({action:"session.list"});')).output.ok).toBe(false);
  await expect(f.client.callTool({ name: 'control', arguments: { action: 'session.list' }, _meta: { 'ai.opencode/sessionID': 'session' } })).rejects.toThrow('Permission denied: openchamber');
  expect(executeAction).toHaveBeenCalledTimes(count);
});

it('keeps memory scoped to the calling session and exposes no tool discovery', async () => {
  const f = await fixture();
  expect((await f.run('return await tools.openchamber_commands.store({key:"saved",value:{number:7}});')).output.ok).toBe(true);
  expect((await f.run('return await tools.openchamber_commands.load({key:"saved"});')).output.value).toEqual({ value: { number: 7 } });
  expect((await f.run('return await tools.openchamber_commands.load({key:"saved"});', 'other-session')).output.ok).toBe(false);
  expect((await f.run('return {global:typeof search,tool:typeof tools.search};')).output.value).toEqual({ global: 'undefined', tool: 'undefined' });
  const unknown = await f.run('return await tools.openchamber_commands_exec_command({cmd:"pwd"});');
  expect(unknown.output.ok).toBe(false);
  expect(JSON.stringify(unknown)).not.toContain('Use search');
});

it('enforces shared permissions and schema constraints and preserves fetch', async () => {
  const f = await fixture();
  expect((await f.run(`return await (await fetch(${JSON.stringify(f.url)})).text();`)).output.value).toBe('FETCH_BODY');
  expect((await f.run('return await tools.file.write({path:"missing-content"});')).output.ok).toBe(false);
  f.permissions.push({ action: 'edit', resource: '*', effect: 'deny' });
  expect((await f.run('return await tools.file.write({path:"denied",content:"x"});')).output.ok).toBe(false);
  await expect(fs.stat(path.join(f.directory, 'denied'))).rejects.toHaveProperty('code', 'ENOENT');
  f.permissions.push({ action: 'webfetch', resource: '*', effect: 'deny' });
  expect((await f.run(`return await fetch(${JSON.stringify(f.url)});`)).output.ok).toBe(false);
});

it('keeps virtual skill filtering and file skill loads on backend context hooks', async () => {
  const f = await fixture();
  f.skills.push({ id: 'virtual', name: 'Virtual', description: 'VIRTUAL_BODY', path: 'skill://virtual/SKILL.md', content: 'BODY' },
    { id: 'local', name: 'Local', description: 'LOCAL_DESCRIPTION', path: '/skills/local/SKILL.md', content: 'BODY' });
  for (const name of ['context', 'compaction', 'generate']) {
    const event = await f.request(name);
    expect(JSON.stringify(event.system)).not.toContain('VIRTUAL_BODY');
    expect(JSON.stringify(event.system)).toContain('LOCAL_DESCRIPTION');
  }
  await expect(f.toolHooks.get('execute.before')({ tool: 'skill', input: { id: 'virtual' } })).rejects.toThrow("Virtual skill 'virtual' is disabled");
  await expect(f.toolHooks.get('execute.before')({ tool: 'skill', input: { id: 'local' } })).resolves.toBeUndefined();
});
