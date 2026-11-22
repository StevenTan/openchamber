import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { Effect, Schema, Stream } from 'effect';
import { materializeCodeModePlugin } from './runtime.js';

const directories = [];
afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });

async function fixture(execute = () => Effect.succeed({ content: 'FILE_CONTENT', metadata: { path: 'a.txt' } })) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'code-mode-catalog-'));
  directories.push(directory);
  const tools = new Map([
    ['example_file', { id: 'example_file', name: 'example_file', description: 'Read a file.\nFULL_READ_INSTRUCTIONS', input: { type: 'object', properties: { path: { type: 'string', description: 'PATH_FIELD_INSTRUCTIONS' } }, required: ['path'] }, options: { codemode: false }, execute }],
    ['patch', { id: 'patch', name: 'patch', description: 'PATCH_FORMAT_EXAMPLE\n*** Begin Patch\n*** Update File: a.txt\n*** End Patch', input: Schema.Struct({ patchText: Schema.String.annotate({ description: 'The full patch text describing add, update, and delete operations' }) }), options: { codemode: false }, execute }],
    ['openchamber_render', { id: 'openchamber_render', name: 'openchamber_render', input: {}, options: { codemode: false } }],
    ['subagent', { id: 'subagent', name: 'subagent', input: {}, options: { codemode: false } }],
    ['openchamber_commands_exec_command', { id: 'openchamber_commands_exec_command', name: 'exec_command', input: {}, options: { namespace: 'openchamber_commands', codemode: false } }],
    ['openchamber_commands_write_stdin', { id: 'openchamber_commands_write_stdin', name: 'write_stdin', input: {}, options: { namespace: 'openchamber_commands', codemode: false } }],
    ['openchamber_commands_clock_sleep', { id: 'openchamber_commands_clock_sleep', name: 'clock_sleep', input: {}, options: { namespace: 'openchamber_commands', codemode: false } }],
    ['openchamber_commands_store', { id: 'openchamber_commands_store', name: 'store', input: {}, options: { namespace: 'openchamber_commands', codemode: false } }],
    ['openchamber_commands_load', { id: 'openchamber_commands_load', name: 'load', input: {}, options: { namespace: 'openchamber_commands', codemode: false } }],
    ['browser_panel', { id: 'browser_panel', name: 'panel', input: {}, options: { namespace: 'browser', codemode: false } }],
    ['browser_click', { id: 'browser_click', name: 'click', input: {}, options: { namespace: 'browser', codemode: false } }],
    ...['write', 'edit', 'patch', 'view_image'].map(name => [`file_${name}`, { id: `file_${name}`, name, input: {}, options: { namespace: 'file', codemode: false } }]),
    ['request_user_input_async', { id: 'request_user_input_async', name: 'user_input_async', input: {}, options: { namespace: 'request', codemode: false } }],
    ...['memory', 'knowledge', 'usage', 'notify'].map(name => [`openchamber_${name}`, { id: `openchamber_${name}`, name, input: {}, options: { namespace: 'openchamber', codemode: false } }]),
  ]);
  const sessionHooks = new Map();
  const toolHooks = new Map();
  const permissions = [];
  const skills = [];
  const ctx = {
    skill: { list: () => Effect.succeed({ data: skills }) },
    tool: {
      list: () => Effect.sync(() => [...tools.values()]),
      transform: run => Effect.sync(() => run({ get: id => tools.get(id), add: tool => tools.set(tool.name, { ...tool, id: tool.name }), remove: id => tools.delete(id), list: () => [...tools.values()], update: (id, change) => change(tools.get(id)) })),
      hook: (name, run) => Effect.sync(() => toolHooks.set(name, event => Effect.runPromise(run(event)))),
    },
    agent: { get: () => Effect.succeed({ data: { permissions: [{ action: '*', resource: '*', effect: 'allow' }] } }) },
    session: { get: () => Effect.succeed({ permissions }), hook: (name, run) => Effect.sync(() => { sessionHooks.set(name, event => Effect.runPromise(run(event))); }) },
    event: { subscribe: () => Stream.never },
  };
  const materialized = await materializeCodeModePlugin(directory);
  const { default: plugin } = await import(pathToFileURL(path.join(materialized, 'index.js')).href);
  await Effect.runPromise(Effect.scoped(plugin.effect(ctx)));
  const request = async (execute = true, messages = [], hook = 'context') => {
    const event = {
      sessionID: 'ses_test', agent: 'build', tools: execute ? { execute: {}, openchamber_render: {}, subagent: {} } : { example_file: {} },
      system: [{ type: 'text', text: 'OLD_PARTIAL_CATALOG\nENVIRONMENT\nNATIVE_SKILL_GUIDANCE', metadata: { experimental: { instructions: [{ key: 'core/codemode', text: 'OLD_PARTIAL_CATALOG' }, { key: 'core/environment', text: 'ENVIRONMENT' }, { key: 'core/skill-guidance', text: 'NATIVE_SKILL_GUIDANCE' }] } } }],
      messages,
    };
    await sessionHooks.get(hook)(event);
    return event;
  };
  return { tools, permissions, skills, request, toolHooks };
}

it('hides virtual skills registered after activation and rejects their loading', async () => {
  const f = await fixture();
  f.skills.push(
    { id: 'virtual', name: 'Virtual', description: 'VIRTUAL_SKILL_BODY', path: 'skill://virtual/SKILL.md', content: 'BODY' },
    { id: 'local', name: 'Local', description: 'LOCAL_SKILL_DESCRIPTION', path: '/skills/local/SKILL.md', content: 'BODY' },
  );
  const event = await f.request();
  const text = event.system.map(part => part.text).join('\n');
  expect(text).not.toContain('VIRTUAL_SKILL_BODY');
  expect(text).toContain('LOCAL_SKILL_DESCRIPTION');
  expect(text).toContain('ENVIRONMENT');
  await expect(f.toolHooks.get('execute.before')({ tool: 'skill', input: { id: 'virtual' } })).rejects.toThrow("Virtual skill 'virtual' is disabled");
  await expect(f.toolHooks.get('execute.before')({ tool: 'skill', input: { id: 'local' } })).resolves.toBeUndefined();
  const direct = await f.request(false);
  expect(JSON.stringify(direct.system)).not.toContain('VIRTUAL_SKILL_BODY');
  expect(JSON.stringify(direct.system)).toContain('LOCAL_SKILL_DESCRIPTION');
  expect(JSON.stringify(direct.messages)).toContain('supersedes historical skill catalog notices');
  for (const name of ['compaction', 'generate']) {
    const auxiliary = await f.request(false, [], name);
    expect(JSON.stringify(auxiliary.system)).not.toContain('VIRTUAL_SKILL_BODY');
    expect(JSON.stringify(auxiliary.system)).toContain('LOCAL_SKILL_DESCRIPTION');
  }
  await expect(f.toolHooks.get('execute.before')({ tool: 'skill', input: {} })).resolves.toBeUndefined();
  await expect(f.toolHooks.get('execute.before')({ tool: 'skill', input: { id: 42 } })).resolves.toBeUndefined();
});

it('preserves file skill visibility rules and follows registry updates', async () => {
  const f = await fixture();
  f.skills.push(
    { id: 'virtual', name: 'Virtual', description: 'VIRTUAL_SKILL_DESCRIPTION', path: 'skill://virtual/SKILL.md', content: '' },
    { id: 'private-notes', name: 'Private', description: 'PRIVATE_SKILL_DESCRIPTION', path: '/skills/private/SKILL.md', content: '' },
    { id: 'manual', name: 'Manual', description: 'MANUAL_SKILL_DESCRIPTION', path: '/skills/manual/SKILL.md', content: '', autoinvoke: false },
  );
  f.permissions.push({ action: 'skill', resource: 'private-*', effect: 'deny' });
  const first = await f.request();
  expect(JSON.stringify(first.system)).not.toContain('PRIVATE_SKILL_DESCRIPTION');
  expect(JSON.stringify(first.system)).not.toContain('MANUAL_SKILL_DESCRIPTION');
  f.skills[0].path = '/skills/virtual/SKILL.md';
  await expect(f.toolHooks.get('execute.before')({ tool: 'skill', input: { id: 'virtual' } })).resolves.toBeUndefined();
});

it('supplies complete descriptions and parameter signatures while preserving direct cards', async () => {
  const f = await fixture();
  const event = await f.request();
  const text = event.system.map(part => part.text).join('\n');
  expect(text).toContain('FULL_READ_INSTRUCTIONS');
  expect(text).toContain('PATH_FIELD_INSTRUCTIONS');
  expect(text).toContain('tools.example_file(');
  expect(f.tools.has('store')).toBe(false);
  expect(f.tools.has('load')).toBe(false);
  expect(text).toContain('ENVIRONMENT');
  expect(text).toContain('NATIVE_SKILL_GUIDANCE');
  expect(text).not.toContain('OLD_PARTIAL_CATALOG');
  expect(text).not.toContain('tools.openchamber_render(');
  expect(text).toContain('Direct tools: openchamber_render, subagent');
  expect(f.tools.get('example_file').options.codemode).toBe(true);
  expect(f.tools.get('example_file').options.pinned).toBe(true);
  expect(f.tools.get('subagent').options.codemode).toBe(false);
  expect(f.tools.get('request_user_input_async').options.codemode).toBe(false);
  expect(text).not.toContain('tools.request.user_input_async(');
  expect(f.tools.get('openchamber_commands_exec_command').options.codemode).toBe(false);
  expect(f.tools.get('openchamber_commands_write_stdin').options.codemode).toBe(false);
  expect(text).not.toContain('tools.openchamber_commands.exec_command(');
  expect(text).not.toContain('tools.openchamber_commands.write_stdin(');
  for (const name of ['write', 'edit', 'patch', 'view_image']) {
    expect(f.tools.get(`file_${name}`).options.codemode).toBe(false);
    expect(text).not.toContain(`tools.file.${name}(`);
  }
  for (const name of ['panel', 'click']) {
    expect(f.tools.get(`browser_${name}`).options.codemode).toBe(false);
    expect(text).not.toContain(`tools.browser.${name}(`);
  }
  for (const name of ['clock_sleep', 'store', 'load']) {
    expect(f.tools.get(`openchamber_commands_${name}`).options.codemode).toBe(false);
    expect(text).not.toContain(`tools.openchamber_commands.${name}(`);
  }
  for (const name of ['memory', 'knowledge', 'usage', 'notify']) {
    expect(f.tools.get(`openchamber_${name}`).options.codemode).toBe(false);
    expect(text).not.toContain(`tools.openchamber.${name}(`);
  }
});

it('keeps simultaneous calls with identical arguments associated with their own results', async () => {
  const release = [];
  const f = await fixture(() => Effect.promise(() => new Promise(resolve => release.push(resolve))));
  const identity = { tool: 'execute', sessionID: 'session', messageID: 'message', id: 'script' };
  const input = { path: 'a.txt' };
  await f.toolHooks.get('execute.before')(identity);
  const first = Effect.runPromise(f.tools.get('example_file').execute(input, identity));
  const second = Effect.runPromise(f.tools.get('example_file').execute(input, identity));
  release[1]({ content: 'SECOND' });
  const two = await second;
  await f.toolHooks.get('execute.after')({ ...identity, tool: 'example_file', input, status: 'completed', result: two });
  release[0]({ content: 'FIRST' });
  const one = await first;
  await f.toolHooks.get('execute.after')({ ...identity, tool: 'example_file', input, status: 'completed', result: one });
  const result = {};
  await f.toolHooks.get('execute.after')({ ...identity, status: 'completed', result });
  expect(result.metadata.openchamberToolCalls.map(call => call.output)).toEqual(['FIRST', 'SECOND']);
  expect(Reflect.ownKeys(one.metadata)).toEqual([]);
  expect(Reflect.ownKeys(two.metadata)).toEqual([]);
});

it('identifies the current complete catalog after historical instruction updates', async () => {
  const f = await fixture();
  const notice = { role: 'system', content: [{ type: 'text', text: 'The Code Mode tool catalog has changed.\n- read (1 tool, none shown)\n\nToday is Tuesday.' }] };
  const user = { role: 'user', content: [{ type: 'text', text: 'Read a file.' }] };
  const event = await f.request(true, [notice, user]);
  expect(event.messages.slice(0, 2)).toEqual([notice, user]);
  const latest = event.messages.at(-1);
  expect(latest.role).toBe('system');
  expect(latest.content[0].text).toContain('complete Code Mode catalog');
  expect(latest.content[0].text).toContain('current tool availability and parameter signatures');
  expect(latest.content[0].text).not.toContain('FULL_READ_INSTRUCTIONS');
});

it('updates descriptions and filters whole-tool permissions on every request', async () => {
  const f = await fixture();
  await f.request();
  f.tools.get('example_file').description = 'UPDATED_READ_INSTRUCTIONS';
  expect(JSON.stringify((await f.request()).system)).toContain('UPDATED_READ_INSTRUCTIONS');
  f.permissions.push({ action: 'example_file', resource: '*', effect: 'deny' });
  expect(JSON.stringify((await f.request()).system)).not.toContain('UPDATED_READ_INSTRUCTIONS');
  f.permissions.push({ action: 'example_file', resource: '/private/*', effect: 'ask' });
  expect(JSON.stringify((await f.request()).system)).toContain('UPDATED_READ_INSTRUCTIONS');
  const event = await f.request(false);
  expect(event.system).toHaveLength(1);
  expect(event.tools).toEqual({ example_file: {} });
  expect(event.messages).toEqual([]);
});

it('renders opaque JSON Schema without importing its constraints into Effect', async () => {
  const f = await fixture();
  f.tools.get('example_file').input = {
    type: 'object', properties: { value: { not: { type: 'string' } } },
    patternProperties: { '^x': { type: 'string' } }, if: { required: ['value'] }, then: { required: ['other'] },
  };
  expect(JSON.stringify((await f.request()).system)).toContain('tools.example_file(');
});

it('records inner file results without changing the returned result or direct calls', async () => {
  const f = await fixture();
  const identity = { tool: 'execute', sessionID: 'session', messageID: 'message', id: 'script' };
  const input = { path: 'a.txt' };
  const direct = await Effect.runPromise(f.tools.get('example_file').execute(input, identity));
  expect(direct.content).toBe('FILE_CONTENT');
  await f.toolHooks.get('execute.before')(identity);
  const returned = await Effect.runPromise(f.tools.get('example_file').execute(input, identity));
  await f.toolHooks.get('execute.after')({ ...identity, tool: 'example_file', input, status: 'completed', result: returned });
  const result = { metadata: { toolCalls: [{ tool: 'example_file', status: 'completed', input }] } };
  await f.toolHooks.get('execute.after')({ ...identity, status: 'completed', result });
  expect(returned).toEqual(direct);
  expect(result.metadata.openchamberToolCalls).toMatchObject([{ tool: 'example_file', input, status: 'completed', output: 'FILE_CONTENT', metadata: { path: 'a.txt' } }]);
  expect(result.metadata.openchamberToolCalls[0].time.end).toBeGreaterThanOrEqual(result.metadata.openchamberToolCalls[0].time.start);
});
