import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../agent-tool/runtime.js';
import { resolveOpenCodeMcpContext } from '../opencode/mcp-context.js';
import plugin from './plugin.js';

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'file-mcp-'));
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }));
  const approve = vi.fn(async () => {});
  let listener;
  const runtime = createAgentToolRuntime({ resolveMcpContext: resolveOpenCodeMcpContext, crypto,
    resolveSessionDirectory: async sessionID => sessionID === 'session' ? directory : null,
    getActivePort: () => listener.address().port,
    permissions: { session: async sessionID => {
      if (sessionID !== 'session') throw new Error('Session directory is unavailable');
      return { directory, projectDirectory: directory, assert: approve };
    } },
  });
  const app = express();
  runtime.registerRoutes(app, express);
  listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  cleanup.push(async () => { await runtime.closeCommands(); await new Promise(resolve => listener.close(resolve)); });
  for (const [key, value] of Object.entries(runtime.createChildEnv())) vi.stubEnv(key, value);
  cleanup.push(() => vi.unstubAllEnvs());
  const transforms = [], removed = [], registered = new Map();
  let config;
  await plugin.setup({
    location: { directory, project: { directory } }, permission: { assert: approve },
    mcp: { transform: async run => run({ set: (name, value) => { config = { name, ...value }; } }) },
    tool: {
      transform: async run => transforms.push(run),
    },
  });
  const client = new Client({ name: 'file-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } });
  cleanup.push(async () => { await transport.terminateSession(); await client.close(); });
  await client.connect(transport);
  for (const tool of (await client.listTools()).tools) registered.set(`file_${tool.name}`, {
    execute: async (input, context) => {
      const result = await client.callTool({ name: tool.name, arguments: input, _meta: { 'ai.opencode/sessionID': context.sessionID } });
      if (result.isError) throw new Error(result.content.map(part => part.text).join('\n'));
      return { ...result, output: result.structuredContent };
    },
  });
  for (const transform of transforms) transform({ remove: name => removed.push(name), update: (name, change) => change(registered.get(name)) });
  const invoke = (name, input) => registered.get(`file_${name}`).execute(input, { sessionID: 'session', agent: 'build', messageID: 'message', id: crypto.randomUUID() });
  return { directory, client, invoke, approve, removed, registered, config };
}

it.each(['body', 'complete'])('discovers shared file tools, preserves edit previews and applies %s patches with recorded file diffs', async format => {
  const f = await fixture();
  expect(f.config).toMatchObject({ name: 'file', codemode: false, oauth: false });
  expect(f.removed).toEqual(['read', 'write', 'edit', 'patch', 'glob', 'grep']);
  const tools = (await f.client.listTools()).tools;
  expect(tools.map(tool => tool.name)).toEqual(['write', 'edit', 'patch', 'view_image']);
  expect(tools.find(tool => tool.name === 'patch').inputSchema.properties.patchText.description).toContain('The tool supplies the outer');
  const created = await f.invoke('write', { path: 'src/code.txt', content: '\uFEFFbefore\r\nlast' });
  expect(created.metadata.files[0]).toMatchObject({ file: 'src/code.txt', status: 'added', additions: 2 });
  await f.invoke('edit', { path: 'src/code.txt', oldString: 'before\nlast', newString: 'after\nlast' });
  expect(await fs.readFile(path.join(f.directory, 'src/code.txt'), 'utf8')).toBe('\uFEFFafter\r\nlast');
  const body = '*** Update File: src/code.txt\n*** Move to: moved.txt\n@@\n-after\n+patched\n last\n*** Add File: disposable\n+hello\n*** Delete File: disposable';
  const patched = await f.invoke('patch', { patchText: format === 'complete' ? `*** Begin Patch\n${body}\n*** End Patch` : body });
  expect(await fs.readFile(path.join(f.directory, 'moved.txt'), 'utf8')).toBe('\uFEFFpatched\nlast\n');
  await expect(fs.stat(path.join(f.directory, 'src/code.txt'))).rejects.toHaveProperty('code', 'ENOENT');
  await expect(fs.stat(path.join(f.directory, 'disposable'))).rejects.toHaveProperty('code', 'ENOENT');
  expect(patched.metadata.files[0].patch).toContain('+patched');
  expect(f.approve.mock.calls.at(-1)[0]).toMatchObject({ action: 'edit', resources: ['src/code.txt', 'moved.txt', 'disposable'], metadata: { files: expect.any(Array) } });
  const large = 'x'.repeat(1024 * 1024);
  await f.invoke('write', { path: 'large.txt', content: large });
  expect(await fs.readFile(path.join(f.directory, 'large.txt'), 'utf8')).toBe(large);
});

it('preserves exact-match errors, replaceAll and permission refusal before writing', async () => {
  const f = await fixture();
  await f.invoke('write', { path: 'code.txt', content: 'same\nsame\n' });
  await expect(f.invoke('edit', { path: 'code.txt', oldString: 'same', newString: 'next' })).rejects.toThrow('Found 2 matches');
  await f.invoke('edit', { path: 'code.txt', oldString: 'same', newString: 'next', replaceAll: true });
  f.approve.mockRejectedValueOnce(new Error('Edit denied'));
  await expect(f.invoke('write', { path: 'code.txt', content: 'forbidden' })).rejects.toThrow('Edit denied');
  expect(await fs.readFile(path.join(f.directory, 'code.txt'), 'utf8')).toBe('next\nnext\n');
});

it('attaches local image bytes through MCP and rejects non-images and missing sessions', async () => {
  const f = await fixture();
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP4z8AARGDiPwMAHfAD/aAzCYkAAAAASUVORK5CYII=', 'base64');
  await fs.writeFile(path.join(f.directory, 'page.png'), image);
  const result = await f.invoke('view_image', { path: 'page.png' });
  expect(result.structuredContent).toEqual({ path: path.join(f.directory, 'page.png'), mime: 'image/png' });
  expect(result.content).toEqual([{ type: 'image', mimeType: 'image/png', data: image.toString('base64') }]);
  expect(f.approve).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'read', resources: ['page.png'] }), expect.any(AbortSignal));
  await fs.writeFile(path.join(f.directory, 'text.txt'), 'text');
  await expect(f.invoke('view_image', { path: 'text.txt' })).rejects.toThrow('Expected a PNG');
  await expect(f.client.callTool({ name: 'write', arguments: { path: 'no.txt', content: '' }, _meta: { 'ai.opencode/sessionID': 'missing' } })).rejects.toThrow('Session directory is unavailable');
});
