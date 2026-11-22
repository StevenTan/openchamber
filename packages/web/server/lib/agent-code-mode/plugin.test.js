import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { Effect, Schema, Stream } from 'effect';
import { materializeCodeModePlugin } from './runtime.js';

const directories = [];
afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });

async function fixture(execute = () => Effect.succeed({ content: 'FILE_CONTENT', metadata: { path: 'a.txt' } })) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'code-mode-catalog-'));
  directories.push(directory);
  await fs.symlink(new URL('../../../node_modules', import.meta.url), path.join(directory, 'node_modules'), 'dir');
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
  ].map(([id, tool]) => [id, { description: tool.name, ...tool }]));
  const sessionHooks = new Map();
  const toolHooks = new Map();
  const permissions = [];
  const skills = [];
  const ctx = {
    permission: { assert: () => Effect.void },
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
      sessionID: 'ses_test', agent: 'build', tools: execute ? { execute: {}, openchamber_execute: {}, openchamber_render: {}, subagent: {}, file_patch: {}, openchamber_commands_exec_command: {} } : { example_file: {} },
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
  expect(f.tools.get('example_file').options.codemode).toBe(false);
  expect(event.tools).not.toHaveProperty('execute');
  expect(event.tools).toHaveProperty('openchamber_execute');
  expect(event.tools).toHaveProperty('file_patch');
  expect(event.tools).toHaveProperty('openchamber_commands_exec_command');
  expect(f.tools.get('subagent').options.codemode).toBe(false);
  expect(f.tools.get('request_user_input_async').options.codemode).toBe(false);
  expect(text).toContain('tools.request.user_input_async(');
  expect(f.tools.get('openchamber_commands_exec_command').options.codemode).toBe(false);
  expect(f.tools.get('openchamber_commands_write_stdin').options.codemode).toBe(false);
  expect(text).toContain('tools.openchamber_commands.exec_command(');
  expect(text).toContain('Direct tool entry: `openchamber_commands_exec_command`. JavaScript call:');
  expect(text).toContain('Direct tool entry: `file_patch`. JavaScript call:');
  expect(text).not.toContain('Direct tool entry: `example_file`');
  expect(text).toContain('tools.openchamber_commands.write_stdin(');
  for (const name of ['write', 'edit', 'patch', 'view_image']) {
    expect(f.tools.get(`file_${name}`).options.codemode).toBe(false);
    expect(text).toContain(`tools.file.${name}(`);
  }
  for (const name of ['panel', 'click']) {
    expect(f.tools.get(`browser_${name}`).options.codemode).toBe(false);
    expect(text).toContain(`tools.browser.${name}(`);
  }
  for (const name of ['clock_sleep', 'store', 'load']) {
    expect(f.tools.get(`openchamber_commands_${name}`).options.codemode).toBe(false);
    expect(text).toContain(`tools.openchamber_commands.${name}(`);
  }
  for (const name of ['memory', 'knowledge', 'usage', 'notify']) {
    expect(f.tools.get(`openchamber_${name}`).options.codemode).toBe(false);
    expect(text).toContain(`tools.openchamber.${name}(`);
  }
});

it('rejects unknown tool calls and preserves namespace path suggestions', async () => {
  const f = await fixture();
  Object.assign(f.tools.get('openchamber_commands_exec_command'), {
    output: Schema.Json,
    execute: ({ cmd }) => Effect.succeed({ output: { status: 'completed', output: cmd } }),
  });
  const identity = { sessionID: 'session', agent: 'build', messageID: 'message', id: 'script', progress: () => Effect.void };
  const run = code => Effect.runPromise(f.tools.get('openchamber_execute').execute({ code }, identity));
  const unknown = await run('return await tools.openchamber_commands_exec_command({ cmd: "pwd" })');
  expect(unknown.output.ok).toBe(false);
  expect(JSON.stringify(unknown)).not.toContain('Use search');
  const namespace = await run('return await tools.openchamber_commands({ cmd: "pwd" })');
  expect(namespace.output.error.suggestions).toEqual([expect.stringContaining('complete Code Mode catalog')]);
  expect(JSON.stringify(namespace)).not.toContain('Use search');
  const corrected = await run('return await tools.openchamber_commands.exec_command({ cmd: "pwd" })');
  expect(corrected.output.value).toEqual({ status: 'completed', output: 'pwd' });
});

it('exposes registered tools without discovery functions inside scripts', async () => {
  const f = await fixture();
  const identity = { sessionID: 'session', agent: 'build', messageID: 'message', id: 'script', progress: () => Effect.void };
  const run = code => Effect.runPromise(f.tools.get('openchamber_execute').execute({ code }, identity));
  const result = await run('return { search: typeof search, alias: typeof tools.search, file: await tools.example_file({ path: "a.txt" }) };');
  expect(result.output.value).toEqual({ search: 'undefined', alias: 'undefined', file: 'FILE_CONTENT' });
  for (const code of ['return await search("file");', 'return await tools.search("file");']) {
    expect((await run(code)).output.ok).toBe(false);
  }
});

it('keeps simultaneous calls with identical arguments associated with their own results', async () => {
  const release = [];
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = await fixture(() => Effect.promise(() => new Promise(resolve => { release.push(resolve); if (release.length === 2) started(); })));
  const identity = { sessionID: 'session', agent: 'build', messageID: 'message', id: 'script', progress: () => Effect.void };
  const script = Effect.runPromise(f.tools.get('openchamber_execute').execute({ code: 'return await Promise.all([tools.example_file({ path: "a.txt" }), tools.example_file({ path: "a.txt" })])' }, identity));
  await ready;
  release[1]({ content: 'SECOND' });
  release[0]({ content: 'FIRST' });
  const result = await script;
  expect(result.output.value).toEqual(['FIRST', 'SECOND']);
  expect(result.metadata.openchamberToolCalls.map(call => call.output)).toEqual(['FIRST', 'SECOND']);
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

it('calls newly discovered MCP tools with the same schemas and structured values', async () => {
  const f = await fixture();
  f.tools.set('external_lookup', { id: 'external_lookup', name: 'lookup', options: { namespace: 'external', codemode: true },
    description: 'EXTERNAL_MCP_DESCRIPTION', input: Schema.Struct({ key: Schema.String }), output: Schema.Struct({ value: Schema.String }),
    execute: ({ key }) => Effect.succeed({ output: { value: key }, content: 'lookup result' }),
  });
  expect(JSON.stringify((await f.request()).system)).toContain('EXTERNAL_MCP_DESCRIPTION');
  const identity = { sessionID: 'session', agent: 'build', messageID: 'message', id: 'script', progress: () => Effect.void };
  const run = code => Effect.runPromise(f.tools.get('openchamber_execute').execute({ code }, identity));
  expect((await run('return await tools.external.lookup({ key: "example" })')).output.value).toEqual({ value: 'example' });
  expect((await run('return await tools.external.lookup({})')).output.ok).toBe(false);
  f.permissions.push({ action: 'external_lookup', resource: '*', effect: 'deny' });
  expect((await run('return await tools.external.lookup({ key: "example" })')).output.ok).toBe(false);
});

it('decodes constrained fields, defaults and transformations from registered schemas', async () => {
  const f = await fixture();
  f.tools.set('schema_probe', { id: 'schema_probe', name: 'schema_probe', description: 'Decode tool arguments',
    input: Schema.Struct({
      pattern: Schema.String.check(Schema.isMinLength(1)).annotate({ identifier: 'SearchPattern' }),
      limit: Schema.Int.check(Schema.isGreaterThan(0)),
      format: Schema.Literals(['text', 'markdown']).pipe(Schema.withDecodingDefaultKey(Effect.succeed('markdown'))),
      timeout: Schema.optionalKey(Schema.Finite),
      count: Schema.NumberFromString,
    }), output: Schema.Json, execute: input => Effect.succeed({ output: input }),
  });
  const identity = { sessionID: 'session', agent: 'build', messageID: 'message', id: 'script', progress: () => Effect.void };
  const run = code => Effect.runPromise(f.tools.get('openchamber_execute').execute({ code }, identity));
  const result = await run('return await tools.schema_probe({pattern:"marker",limit:10,timeout:20,count:"3"});');
  expect(result.output.value).toEqual({ pattern: 'marker', limit: 10, format: 'markdown', timeout: 20, count: 3 });
  const catalog = JSON.stringify((await f.request()).system);
  expect(catalog).toContain('pattern: string');
  f.tools.set('encoded_probe', { id: 'encoded_probe', name: 'encoded_probe', description: 'Encode the tool result',
    input: Schema.Struct({}), output: Schema.Struct({ count: Schema.NumberFromString }),
    execute: () => Effect.succeed({ output: { count: 3 } }),
  });
  const encoded = await run('return await tools.encoded_probe({});');
  expect(encoded.output.value).toEqual({ count: '3' });
  expect(JSON.parse(encoded.metadata.openchamberToolCalls[0].output)).toEqual({ count: '3' });
  const invalid = await run('return await tools.schema_probe({pattern:"",limit:1.5,count:"3"});');
  expect(invalid.output.ok).toBe(false);
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
  const identity = { sessionID: 'session', agent: 'build', messageID: 'message', id: 'script', progress: () => Effect.void };
  const input = { path: 'a.txt' };
  const direct = await Effect.runPromise(f.tools.get('example_file').execute(input, identity));
  expect(direct.content).toBe('FILE_CONTENT');
  const result = await Effect.runPromise(f.tools.get('openchamber_execute').execute({ code: 'return await tools.example_file({ path: "a.txt" })' }, identity));
  expect(result.output.value).toBe(direct.content);
  expect(result.metadata.openchamberToolCalls).toMatchObject([{ tool: 'example_file', input, status: 'completed', output: 'FILE_CONTENT', metadata: { path: 'a.txt' } }]);
  expect(result.metadata.openchamberToolCalls[0].time.end).toBeGreaterThanOrEqual(result.metadata.openchamberToolCalls[0].time.start);
  Object.assign(f.tools.get('example_file'), {
    output: Schema.Json,
    execute: () => Effect.succeed({ output: { files: ['a.txt'] } }),
  });
  const structured = await Effect.runPromise(f.tools.get('openchamber_execute').execute({ code: 'return await tools.example_file({ path: "a.txt" })' }, identity));
  expect(structured.output.value).toEqual({ files: ['a.txt'] });
  expect(JSON.parse(structured.metadata.openchamberToolCalls[0].output)).toEqual({ files: ['a.txt'] });
});

it('preserves fetch response methods and webfetch denies across redirects', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect') response.writeHead(302, { location: '/data' }).end();
    else response.writeHead(200, { 'content-type': 'application/json' }).end('{"value":42}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const f = await fixture();
    const identity = { sessionID: 'session', agent: 'build', messageID: 'message', id: 'script', progress: () => Effect.void };
    const base = `http://127.0.0.1:${server.address().port}`;
    const run = () => Effect.runPromise(f.tools.get('openchamber_execute').execute({ code: `const r = await fetch(${JSON.stringify(base + '/redirect')}); return { status: r.status, redirected: r.redirected, type: r.headers.get('content-type'), body: await r.json() };` }, identity));
    const result = await run();
    expect(result.output.value).toEqual({ status: 200, redirected: true, type: 'application/json', body: { value: 42 } });
    expect(result.metadata.openchamberToolCalls).toMatchObject([{ tool: 'fetch', input: { url: base + '/redirect', method: 'GET' }, status: 'completed' }]);
    f.permissions.push({ action: 'webfetch', resource: base + '/data', effect: 'deny' });
    expect((await run()).output.error.message).toContain('Permission denied: webfetch');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
