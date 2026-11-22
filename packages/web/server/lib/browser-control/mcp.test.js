import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentToolRuntime } from '../agent-tool/runtime.js';

let root, runtime, listener, client, transport, env, config, executeAction, hooks, approve;
const caller = { sessionID: 'session-a', agent: 'build', messageID: 'message-a', id: 'call-a' };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-mcp-'));
  executeAction = vi.fn(async () => ({ content: [{ type: 'text', text: 'Clicked Save' }] }));
  runtime = createAgentToolRuntime({
    crypto, fsPromises: fs, path, instanceDir: root,
    getActivePort: () => listener.address().port,
    resolveSessionDirectory: async session => path.join(root, session),
    executeAction,
    permissions: { session: async () => ({ directory: root, projectDirectory: root, assert: approve }) },
  });
  const app = express();
  runtime.registerRoutes(app, express);
  listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  env = runtime.createChildEnv();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const directory = await runtime.materializePlugin({ includeControl: false, includeMemory: false, includeWeb: true });
  const plugin = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  hooks = new Map();
  approve = vi.fn(async () => {});
  await plugin.default.setup({
    tool: {
      transform: async edit => edit({ add: () => { throw Error('Browser must use native MCP'); }, namespace: () => {} }),
      hook: async (name, run) => hooks.set(name, run),
    },
    permission: { assert: approve },
    mcp: { transform: async edit => edit({ set: (name, value) => { config = { name, ...value }; } }) },
  });
  client = new Client({ name: 'browser-test', version: '1' });
  transport = new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } });
  await client.connect(transport);
});

afterEach(async () => {
  await transport.terminateSession();
  await client.close();
  await runtime.closeCommands();
  await new Promise(resolve => listener.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const call = (name, args, sessionID = caller.sessionID, options) => client.callTool({ name, arguments: args, _meta: { 'ai.opencode/sessionID': sessionID } }, undefined, options);

it('discovers native browser tools with upstream schemas and forwards session and tab ownership', async () => {
  expect(config).toMatchObject({ name: 'browser', codemode: false, oauth: false });
  const catalog = await client.listTools();
  const panel = catalog.tools.find(tool => tool.name === 'panel');
  expect(panel.inputSchema.properties.action.enum).toContain('browser.close');
  expect(panel.inputSchema.properties.action.enum).not.toContain('browser.playwright');
  expect(panel.inputSchema.properties.parameters.properties).toHaveProperty('label');
  expect(panel.inputSchema.properties.parameters.properties).not.toHaveProperty('path');
  const click = catalog.tools.find(tool => tool.name === 'click');
  expect(click.inputSchema.properties.target.type).toBe('string');
  expect(click.inputSchema.properties.tabId.type).toBe('string');
  expect(catalog.tools.map(tool => tool.name)).not.toContain('handle_dialog');
  expect(await call('click', { target: 'e5', tabId: 'panel-a' })).toEqual({ content: [{ type: 'text', text: 'Clicked Save' }] });
  expect(executeAction).toHaveBeenLastCalledWith('browser.playwright', {
    action: 'browser.playwright', tool: 'browser_click', arguments: { target: 'e5' }, tabId: 'panel-a',
  }, path.join(root, 'session-a'), expect.objectContaining({ contextSessionId: 'session-a', signal: expect.any(AbortSignal) }));
  await call('snapshot', {}, 'session-b');
  expect(executeAction.mock.lastCall[2]).toBe(path.join(root, 'session-b'));
  expect(executeAction.mock.lastCall[3].contextSessionId).toBe('session-b');
  const media = { content: [{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }] };
  executeAction.mockResolvedValueOnce(media);
  expect(await call('snapshot', {})).toEqual(media);
  await request(listener).post('/api/openchamber/browser-tool/mcp').send({}).expect(401);
});

it('preserves panel inputs, result envelopes and activity metadata', async () => {
  executeAction.mockResolvedValue({ tabId: 'panel-a', url: 'http://127.0.0.1:8900/' });
  const opened = await call('panel', { action: 'browser.open', url: 'http://127.0.0.1:8900/', viewport: 'mobile' });
  expect(opened.structuredContent).toMatchObject({ ok: true, action: 'browser.open', data: { tabId: 'panel-a' } });
  expect(executeAction.mock.lastCall[1]).toEqual({ action: 'browser.open', url: 'http://127.0.0.1:8900/', viewport: 'mobile' });
  await call('panel', { action: 'browser.open', url: 'ignored', parameters: { url: 'http://127.0.0.1:8900/nested' } });
  expect(executeAction.mock.lastCall[1].url).toBe('http://127.0.0.1:8900/nested');
  await call('panel', { action: 'browser.type', parameters: { selector: '#q', value: 'x', submit: 'true' } });
  expect(executeAction.mock.lastCall[1].submit).toBe(true);
  const result = { output: opened.structuredContent };
  await hooks.get('execute.after')({ ...caller, tool: 'browser_panel', status: 'completed', result });
  expect(result.metadata.openchamber).toMatchObject({ action: 'browser.open', ok: true, description: 'Open a page in the browser panel' });
});

it('applies browser permissions to panel and page tools before invocation', async () => {
  for (const [tool, args] of [['panel', { action: 'browser.snapshot' }], ['click', { element: 'Save', ref: 'e1' }]]) {
    approve.mockRejectedValueOnce(new Error('Browser denied'));
    await expect(call(tool, args)).rejects.toThrow('Browser denied');
    expect(approve).toHaveBeenLastCalledWith({ action: 'openchamber_web', resources: ['*'], save: ['*'] }, expect.any(AbortSignal));
  }
  expect(executeAction).not.toHaveBeenCalled();
});

it('delivers MCP cancellation and session stop to browser actions', async () => {
  for (const method of ['mcp', 'session']) {
    const started = Promise.withResolvers();
    const aborted = Promise.withResolvers();
    executeAction.mockImplementationOnce(async (_action, _input, _directory, { signal }) => {
      started.resolve(signal);
      await new Promise((_, reject) => signal.addEventListener('abort', () => { aborted.resolve(); reject(signal.reason); }, { once: true }));
    });
    const controller = new AbortController();
    const pending = call('wait_for', { text: 'Finished' }, caller.sessionID, { signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    const signal = await started.promise;
    if (method === 'mcp') controller.abort();
    else runtime.abortSession(caller.sessionID);
    await rejected;
    await aborted.promise;
    expect(signal.aborted).toBe(true);
  }
});
