import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { OpenCode } from '@opencode/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createToolPermissions } from './permissions.js';
import { registerToolPermissionRoutes } from './permission-routes.js';
import { createAgentToolRuntime } from './runtime.js';

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-permissions-'));
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }));
  let policy = { directory, projectDirectory: directory, rules: [{ action: '*', resource: '*', effect: 'ask' }] };
  const publish = vi.fn();
  const options = { file: path.join(directory, 'permissions.json'), readPolicy: async () => policy, publish };
  const permissions = createToolPermissions(options);
  const session = await permissions.session('session');
  return { directory, options, permissions, session, publish, policy: next => { policy = next; } };
}
const request = { action: 'shell', resources: ['git status'], save: ['git status*'] };
const signal = () => new AbortController().signal;

it('evaluates ordered rules and keeps configured denies ahead of saved grants', async () => {
  const f = await fixture();
  f.policy({ directory: f.directory, projectDirectory: f.directory,
    rules: [{ action: '*', resource: '*', effect: 'allow' }, { action: 'shell', resource: 'git *', effect: 'deny' },
      { action: 'shell', resource: 'git status*', effect: 'allow' }],
    savedRules: [{ action: 'shell', resource: '*', effect: 'allow' }],
  });
  const session = await f.permissions.session('session');
  await session.assert(request, signal());
  await expect(session.assert({ ...request, resources: ['git status', 'git push'] }, signal())).rejects.toThrow('Permission denied');
  expect(f.publish).not.toHaveBeenCalled();
});

it('persists project approvals for later sessions while once and rejection stay local to the request', async () => {
  const f = await fixture();
  const once = f.session.assert(request, signal());
  await f.permissions.reply('session', f.permissions.list()[0].request.id, 'once');
  await once;
  const rejected = f.session.assert(request, signal());
  const failure = expect(rejected).rejects.toThrow('Stop');
  await f.permissions.reply('session', f.permissions.list()[0].request.id, 'reject', 'Stop');
  await failure;
  const always = f.session.assert(request, signal());
  await f.permissions.reply('session', f.permissions.list()[0].request.id, 'always');
  await always;
  const restored = createToolPermissions(f.options);
  await (await restored.session('another-session')).assert({ ...request, resources: ['git status --short'] }, signal());
  expect(restored.list()).toEqual([]);
  f.policy({ directory: '/another-project', projectDirectory: '/another-project', rules: [] });
  const other = await restored.session('other');
  const controller = new AbortController();
  const pending = other.assert(request, controller.signal);
  const cancelled = expect(pending).rejects.toThrow('cancelled');
  expect(restored.list()).toHaveLength(1);
  controller.abort();
  await cancelled;
  expect(restored.list()).toEqual([]);
});

it('runs MCP mutations only after the existing permission HTTP API approves their diff', async () => {
  const f = await fixture();
  const runtime = createAgentToolRuntime({ crypto, fsPromises: fs, path, instanceDir: f.directory, permissions: f.permissions,
    resolveSessionDirectory: async () => f.directory, getActivePort: () => listener.address().port });
  const app = express();
  runtime.registerRoutes(app, express);
  const native = { id: 'per_native', sessionID: 'native', action: 'shell', resources: ['pwd'], save: ['pwd'] };
  registerToolPermissionRoutes(app, express, { permissions: f.permissions, directory: async () => f.directory, listNative: async () => ({ location: { directory: f.directory }, data: [native] }) });
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  cleanup.push(async () => { await runtime.closeCommands(); await new Promise(resolve => listener.close(resolve)); });
  const api = OpenCode.make({ baseUrl: `http://127.0.0.1:${listener.address().port}` });
  const client = new Client({ name: 'permission-proof', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL('/api/openchamber/file-tool/mcp', `http://127.0.0.1:${listener.address().port}`), {
    requestInit: { headers: { authorization: 'Bearer ' + runtime.createChildEnv().OPENCHAMBER_AGENT_TOOL_TOKEN } },
  });
  cleanup.push(async () => { await transport.terminateSession(); await client.close(); });
  await client.connect(transport);
  const asked = Promise.withResolvers();
  f.publish.mockImplementation((type, data) => { if (type === 'permission.asked') asked.resolve(data); });
  const mutation = client.callTool({ name: 'write', arguments: { path: 'approved.txt', content: 'approved' }, _meta: { 'ai.opencode/sessionID': 'session' } });
  const approval = await asked.promise;
  expect(approval.metadata.files[0].patch).toContain('+approved');
  await expect(fs.stat(path.join(f.directory, 'approved.txt'))).rejects.toHaveProperty('code', 'ENOENT');
  expect((await api.permission.request.list()).data.map(entry => entry.id)).toEqual([native.id, approval.id]);
  expect((await api.permission.get({ sessionID: 'session', requestID: approval.id })).id).toBe(approval.id);
  await api.permission.reply({ sessionID: 'session', requestID: approval.id, decision: 'once' });
  expect((await mutation).isError).not.toBe(true);
  expect(await fs.readFile(path.join(f.directory, 'approved.txt'), 'utf8')).toBe('approved');
  expect(f.permissions.list()).toEqual([]);
  expect(f.publish.mock.lastCall[0]).toBe('permission.replied');
});

it('settles pending calls by session on rejection and by project patterns on always', async () => {
  const f = await fixture();
  const first = f.session.assert(request, signal());
  const second = f.session.assert({ ...request, resources: ['git diff'] }, signal());
  const rejected = Promise.allSettled([first, second]);
  await f.permissions.reply('session', f.permissions.list()[0].request.id, 'reject');
  expect((await rejected).map(result => result.status)).toEqual(['rejected', 'rejected']);
  const a = f.session.assert(request, signal());
  const b = (await f.permissions.session('another-session')).assert(request, signal());
  await f.permissions.reply('session', f.permissions.list()[0].request.id, 'always');
  await Promise.all([a, b]);
  expect(f.permissions.list()).toEqual([]);
});

it('matches saved command prefixes with no arguments', async () => {
  const f = await fixture();
  const pwd = { action: 'shell', resources: ['pwd'], save: ['pwd *'] };
  const first = f.session.assert(pwd, signal());
  await f.permissions.reply('session', f.permissions.list()[0].request.id, 'always');
  await first;
  await f.session.assert(pwd, signal());
  f.policy({ directory: f.directory, projectDirectory: f.directory,
    rules: [{ action: 'shell', resource: 'pwd *', effect: 'deny' }],
  });
  await expect((await f.permissions.session('session')).assert(pwd, signal())).rejects.toThrow('Permission denied');
});
