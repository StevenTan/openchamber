import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { materializeCollaborationPlugin } from './runtime.js';

let directory, tools, ctx, native, close, wait;
const invocation = signal => ({ sessionID: 'parent', agent: 'build', messageID: 'message', id: 'call', signal: signal ?? new AbortController().signal, progress: vi.fn(async () => {}) });
const content = result => JSON.parse(result.content);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubEnv('OPENCHAMBER_AGENT_TOOL_URL', 'http://127.0.0.1:4001/api/openchamber/agent-tool');
  vi.stubEnv('OPENCHAMBER_AGENT_TOOL_TOKEN', 'fixture');
  vi.stubEnv('NO_PROXY', '');
  vi.stubEnv('no_proxy', '');
  wait = vi.fn(async ({ target }) => Response.json({ session_id: target, status: 'idle', output: 'Finished' }));
  vi.stubGlobal('fetch', (_url, init) => wait(JSON.parse(init.body), { signal: init.signal }));
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-collaboration-'));
  tools = new Map();
  native = { execute: vi.fn(async () => ({ output: { sessionID: 'child' }, content: 'Background agent continues', metadata: { sessionID: 'child' } })) };
  ctx = {
    session: {
      get: vi.fn(async ({ sessionID }) => ({ id: sessionID, parentID: 'parent', agent: 'explore', title: 'Research' })),
      interrupt: vi.fn(async () => ({ interrupted: true })),
    },
    permission: { assert: vi.fn(async () => {}) },
    tool: { transform: async fn => fn({ get: () => native, namespace() {}, add: tool => tools.set(tool.name, tool) }) },
  };
  const pluginDirectory = await materializeCollaborationPlugin(directory);
  const { default: plugin } = await import(pathToFileURL(path.join(pluginDirectory, 'index.js')).href);
  close = await plugin.setup(ctx);
});

afterEach(async () => {
  close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await fs.rm(directory, { recursive: true, force: true });
});

const blockedWait = (_input, { signal }) => new Promise((_resolve, reject) => {
  signal.throwIfAborted();
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

it('delegates follow-ups to the native background subagent and preserves completion metadata', async () => {
  const result = await tools.get('send_input').execute({ target: 'child', message: 'Continue researching' }, invocation());
  expect(native.execute).toHaveBeenCalledWith({ agent: 'explore', description: 'Research', prompt: 'Continue researching', sessionID: 'child', background: true }, expect.objectContaining({ sessionID: 'parent' }));
  expect(result).toEqual({ content: 'Background agent continues', metadata: { sessionID: 'child' } });
  expect(result).not.toHaveProperty('output');
});

it.each([
  ['send_input', { target: 'foreign', message: 'Continue' }],
  ['wait_agent', { targets: ['foreign'] }],
  ['interrupt_agent', { target: 'foreign' }],
])('rejects unrelated sessions in %s before performing an operation', async (name, input) => {
  ctx.session.get.mockResolvedValue({ id: 'foreign', parentID: 'another-parent', agent: 'explore' });
  await expect(tools.get(name).execute(input, invocation())).rejects.toThrow('not a child');
  expect(native.execute).not.toHaveBeenCalled();
  expect(wait).not.toHaveBeenCalled();
  expect(ctx.session.interrupt).not.toHaveBeenCalled();
});

it('checks the child agent permission before interrupting', async () => {
  ctx.permission.assert.mockRejectedValue(new Error('Permission denied'));
  await expect(tools.get('interrupt_agent').execute({ target: 'child' }, invocation())).rejects.toThrow('Permission denied');
  expect(ctx.permission.assert).toHaveBeenCalledWith(expect.objectContaining({ action: 'subagent', resources: ['explore'] }));
  expect(ctx.session.interrupt).not.toHaveBeenCalled();
});

it('returns the first idle child and releases other wait requests', async () => {
  wait.mockImplementation((input, options) => input.target === 'slow' ? blockedWait(input, options) : Promise.resolve(Response.json({ session_id: input.target, status: 'idle', output: 'Finished' })));
  const result = content(await tools.get('wait_agent').execute({ targets: ['slow', 'child'] }, invocation()));
  expect(result).toEqual({ timed_out: false, result: { session_id: 'child', status: 'idle', output: 'Finished' } });
  expect(wait.mock.calls[0][1].signal.aborted).toBe(true);
  expect(ctx.session.interrupt).not.toHaveBeenCalled();
});

it('reports an idle child error with its partial assistant text', async () => {
  wait.mockResolvedValue(Response.json({ session_id: 'child', status: 'idle', output: 'Partial', error: { message: 'Provider failed' } }));
  const result = content(await tools.get('wait_agent').execute({ targets: ['child'] }, invocation()));
  expect(result.result).toMatchObject({ output: 'Partial', error: { message: 'Provider failed' } });
});

it('times out without interrupting the child', async () => {
  wait.mockImplementation(blockedWait);
  const pending = tools.get('wait_agent').execute({ targets: ['child'], timeout_ms: 10000 }, invocation());
  await vi.advanceTimersByTimeAsync(10000);
  expect(content(await pending)).toEqual({ timed_out: true, result: null });
  expect(wait.mock.calls[0][1].signal.aborted).toBe(true);
  expect(ctx.session.interrupt).not.toHaveBeenCalled();
});

it.each(['cancel', 'unload'])('releases pending waits on %s without stopping child execution', async reason => {
  wait.mockImplementation(blockedWait);
  const controller = new AbortController();
  const pending = tools.get('wait_agent').execute({ targets: ['child'] }, invocation(controller.signal));
  const rejected = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(0);
  if (reason === 'cancel') controller.abort();
  else close();
  await rejected;
  expect(wait.mock.calls[0][1].signal.aborted).toBe(true);
  expect(ctx.session.interrupt).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('surfaces wait API failures instead of reporting completion or timeout', async () => {
  wait.mockRejectedValue(new Error('Connection failed'));
  await expect(tools.get('wait_agent').execute({ targets: ['child'] }, invocation())).rejects.toThrow('Connection failed');
});

it('requests interruption without automatically resuming the child', async () => {
  expect(content(await tools.get('interrupt_agent').execute({ target: 'child' }, invocation()))).toEqual({ session_id: 'child', interrupted: true });
  expect(ctx.session.interrupt).toHaveBeenCalledWith({ sessionID: 'child', resume: false }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it('does not expose coordination tools when the native subagent tool is absent', async () => {
  const { default: plugin } = await import('./dist/plugin.js');
  native = undefined;
  tools.clear();
  const dispose = await plugin.setup(ctx);
  expect(tools.size).toBe(0);
  dispose();
});
