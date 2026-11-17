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
    ['read', { id: 'read', name: 'read', description: 'Read a file.\nFULL_READ_INSTRUCTIONS', input: { type: 'object', properties: { path: { type: 'string', description: 'PATH_FIELD_INSTRUCTIONS' } }, required: ['path'] }, options: { codemode: false }, execute }],
    ['patch', { id: 'patch', name: 'patch', description: 'PATCH_FORMAT_EXAMPLE\n*** Begin Patch\n*** Update File: a.txt\n*** End Patch', input: Schema.Struct({ patchText: Schema.String.annotate({ description: 'The full patch text describing add, update, and delete operations' }) }), options: { codemode: false }, execute }],
    ['openchamber_render', { id: 'openchamber_render', name: 'openchamber_render', input: {}, options: { codemode: false } }],
    ['subagent', { id: 'subagent', name: 'subagent', input: {}, options: { codemode: false } }],
  ]);
  let hook;
  const toolHooks = new Map();
  const permissions = [];
  const ctx = {
    tool: {
      list: () => Effect.sync(() => [...tools.values()]),
      transform: run => Effect.sync(() => run({ list: () => [...tools.values()], update: (id, change) => change(tools.get(id)) })),
      hook: (name, run) => Effect.sync(() => toolHooks.set(name, event => Effect.runPromise(run(event)))),
    },
    agent: { get: () => Effect.succeed({ data: { permissions: [{ action: '*', resource: '*', effect: 'allow' }] } }) },
    session: { get: () => Effect.succeed({ permissions }), hook: (_name, run) => Effect.sync(() => { hook = event => Effect.runPromise(run(event)); }) },
    event: { subscribe: () => Stream.never },
  };
  const materialized = await materializeCodeModePlugin(directory);
  const { default: plugin } = await import(pathToFileURL(path.join(materialized, 'index.js')).href);
  await Effect.runPromise(Effect.scoped(plugin.effect(ctx)));
  const request = async (execute = true, messages = []) => {
    const event = {
      sessionID: 'ses_test', agent: 'build', tools: execute ? { execute: {}, openchamber_render: {}, subagent: {} } : { read: {} },
      system: [{ type: 'text', text: 'OLD_PARTIAL_CATALOG\nENVIRONMENT', metadata: { experimental: { instructions: [{ key: 'core/codemode', text: 'OLD_PARTIAL_CATALOG' }, { key: 'core/environment', text: 'ENVIRONMENT' }] } } }],
      messages,
    };
    await hook(event);
    return event;
  };
  return { tools, permissions, request, toolHooks };
}

it('supplies complete descriptions and parameter signatures while preserving direct cards', async () => {
  const f = await fixture();
  const event = await f.request();
  const text = event.system.map(part => part.text).join('\n');
  expect(text).toContain('FULL_READ_INSTRUCTIONS');
  expect(text).toContain('PATH_FIELD_INSTRUCTIONS');
  expect(text).toContain('tools.read(');
  expect(text).toContain('ENVIRONMENT');
  expect(text).not.toContain('OLD_PARTIAL_CATALOG');
  expect(text).not.toContain('tools.openchamber_render(');
  expect(text).toContain('Direct tools: openchamber_render, subagent');
  expect(f.tools.get('read').options.codemode).toBe(true);
  expect(f.tools.get('read').options.pinned).toBe(true);
  expect(f.tools.get('subagent').options.codemode).toBe(false);
});

it('supplies native patch boundaries for file operation sections', async () => {
  const received = [];
  const f = await fixture(input => { received.push(input); return Effect.succeed({ content: 'PATCH_APPLIED' }); });
  const patch = f.tools.get('patch');
  const document = (await f.request()).system.map(part => part.text).join('\n');
  const requirement = "The tool supplies the outer '*** Begin Patch' and '*** End Patch' lines.";
  expect(patch.description).toContain(requirement);
  expect(patch.description).toContain('Example patchText:');
  expect(patch.description).not.toContain('\n*** Begin Patch\n');
  expect(patch.input.fields.patchText.ast.annotations.description).toContain(requirement);
  expect(document).toContain('tools.patch(');
  expect(document).toContain(requirement);
  const body = '*** Update File: a.txt\n@@\n-before\n+after';
  const framed = `*** Begin Patch\n${body}\n*** End Patch`;
  for (const patchText of [body, body.replaceAll('\n', '\r\n'), `\n${body}\n`]) {
    const input = { patchText };
    expect(Schema.decodeUnknownSync(patch.input)(input)).toEqual(input);
    expect(await Effect.runPromise(patch.execute(input, { sessionID: 's', messageID: 'm', id: 'c' }))).toEqual({ content: 'PATCH_APPLIED' });
  }
  expect(received.map(input => input.patchText.replaceAll('\r\n', '\n'))).toEqual([framed, framed, framed]);
});

it('keeps simultaneous calls with identical arguments associated with their own results', async () => {
  const release = [];
  const f = await fixture(() => Effect.promise(() => new Promise(resolve => release.push(resolve))));
  const identity = { tool: 'execute', sessionID: 'session', messageID: 'message', id: 'script' };
  const input = { path: 'a.txt' };
  await f.toolHooks.get('execute.before')(identity);
  const first = Effect.runPromise(f.tools.get('read').execute(input, identity));
  const second = Effect.runPromise(f.tools.get('read').execute(input, identity));
  release[1]({ content: 'SECOND' });
  const two = await second;
  await f.toolHooks.get('execute.after')({ ...identity, tool: 'read', input, status: 'completed', result: two });
  release[0]({ content: 'FIRST' });
  const one = await first;
  await f.toolHooks.get('execute.after')({ ...identity, tool: 'read', input, status: 'completed', result: one });
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
  f.tools.get('read').description = 'UPDATED_READ_INSTRUCTIONS';
  expect(JSON.stringify((await f.request()).system)).toContain('UPDATED_READ_INSTRUCTIONS');
  f.permissions.push({ action: 'read', resource: '*', effect: 'deny' });
  expect(JSON.stringify((await f.request()).system)).not.toContain('UPDATED_READ_INSTRUCTIONS');
  f.permissions.push({ action: 'read', resource: '/private/*', effect: 'ask' });
  expect(JSON.stringify((await f.request()).system)).toContain('UPDATED_READ_INSTRUCTIONS');
  const event = await f.request(false);
  expect(event.system).toHaveLength(1);
  expect(event.tools).toEqual({ read: {} });
  expect(event.messages).toEqual([]);
});

it('renders opaque JSON Schema without importing its constraints into Effect', async () => {
  const f = await fixture();
  f.tools.get('read').input = {
    type: 'object', properties: { value: { not: { type: 'string' } } },
    patternProperties: { '^x': { type: 'string' } }, if: { required: ['value'] }, then: { required: ['other'] },
  };
  expect(JSON.stringify((await f.request()).system)).toContain('tools.read(');
});

it('records inner file results without changing the returned result or direct calls', async () => {
  const f = await fixture();
  const identity = { tool: 'execute', sessionID: 'session', messageID: 'message', id: 'script' };
  const input = { path: 'a.txt' };
  const direct = await Effect.runPromise(f.tools.get('read').execute(input, identity));
  expect(direct.content).toBe('FILE_CONTENT');
  await f.toolHooks.get('execute.before')(identity);
  const returned = await Effect.runPromise(f.tools.get('read').execute(input, identity));
  await f.toolHooks.get('execute.after')({ ...identity, tool: 'read', input, status: 'completed', result: returned });
  const result = { metadata: { toolCalls: [{ tool: 'read', status: 'completed', input }] } };
  await f.toolHooks.get('execute.after')({ ...identity, status: 'completed', result });
  expect(returned).toEqual(direct);
  expect(result.metadata.openchamberToolCalls).toMatchObject([{ tool: 'read', input, status: 'completed', output: 'FILE_CONTENT', metadata: { path: 'a.txt' } }]);
  expect(result.metadata.openchamberToolCalls[0].time.end).toBeGreaterThanOrEqual(result.metadata.openchamberToolCalls[0].time.start);
});
