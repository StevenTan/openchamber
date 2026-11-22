import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuestionRuntime, questionStoreDirectory } from './dist/runtime.js';
import { createAgentToolRuntime } from '../agent-tool/runtime.js';

const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const missing = () => Object.assign(new Error('Not found'), { _tag: 'FormNotFoundError' });
const payload = (callID = 'call_1') => ({ sessionID: 'ses_1', callID, input: { questions: [{ title: 'Choose a color', options: ['Blue', 'Green'] }] } });

async function fixture() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'async-questions-'));
  cleanup.push(() => fs.rm(dataDir, { recursive: true, force: true }));
  const forms = new Map();
  const delivered = new Map();
  let eventListener;
  let statusListener;
  const session = {
    get: vi.fn(async () => ({ id: 'ses_1' })),
    form: {
      get: vi.fn(async ({ formID }) => { if (!forms.has(formID)) throw missing(); return forms.get(formID); }),
      create: vi.fn(async input => { forms.set(input.id, { ...input, state: { status: 'pending' } }); return input; }),
      reply: vi.fn(async ({ formID, answer }) => { const form = forms.get(formID); if (!form) throw missing(); form.state = { status: 'answered', answer }; }),
      cancel: vi.fn(async ({ formID }) => { const form = forms.get(formID); if (!form) throw missing(); form.state = { status: 'cancelled' }; }),
    },
    synthetic: vi.fn(async input => {
      if (delivered.has(input.id)) throw Object.assign(new Error('Duplicate message'), { status: 409 });
      delivered.set(input.id, input);
    }),
  };
  const archived = vi.fn(async () => false);
  const runtime = () => {
    const result = createQuestionRuntime({
      dataDir, client: () => ({ session }), isSessionArchived: archived, isEnabled: () => true, retryMs: 5,
      globalEventHub: {
        subscribeEvent: listener => { eventListener = listener; return () => { eventListener = undefined; }; },
        subscribeStatus: listener => { statusListener = listener; return () => { statusListener = undefined; }; },
      },
    });
    cleanup.push(() => result.stop());
    return result;
  };
  return { dataDir, forms, delivered, session, archived, runtime, emit: payload => eventListener({ payload }), reconnect: () => statusListener({ type: 'connect' }) };
}

describe('asynchronous questions', () => {
  it('creates independently identified native MCP questions with session ownership and immediate receipts', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    const directory = await runtime.materializePlugin(f.dataDir);
    const { default: plugin } = await import(pathToFileURL(path.join(directory, 'index.js')).href);
    let config;
    const hooks = new Map();
    const approve = vi.fn(async () => {});
    const asyncTool = { options: { codemode: false } };
    const nativeQuestion = { description: 'Native question usage notes', input: {}, execute: vi.fn() };
    const originalQuestion = { ...nativeQuestion };
    let listener;
    const agentRuntime = createAgentToolRuntime({
      crypto, fsPromises: fs, path, instanceDir: f.dataDir, questionRuntime: runtime,
      getActivePort: () => listener.address().port,
      permissions: { session: async () => ({ directory: f.dataDir, projectDirectory: f.dataDir, assert: approve }) },
    });
    const app = express();
    agentRuntime.registerRoutes(app, express);
    listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    cleanup.push(async () => { await agentRuntime.closeCommands(); await new Promise(resolve => listener.close(resolve)); });
    for (const [key, value] of Object.entries(agentRuntime.createChildEnv())) vi.stubEnv(key, value);
    cleanup.push(() => vi.unstubAllEnvs());
    await plugin.setup({
      permission: { assert: approve },
      mcp: { transform: async run => run({ set: (name, value) => { config = { name, ...value }; } }) },
      tool: {
        transform: async run => run({ update: (name, change) => change(name === 'question' ? nativeQuestion : asyncTool) }),
        hook: async (name, run) => hooks.set(name, run),
      },
    });
    expect(nativeQuestion.description).toContain('Waits for the user to answer before returning.');
    expect(nativeQuestion.description).toContain('answer is required before further work can proceed.');
    expect(nativeQuestion.description).toContain(originalQuestion.description);
    expect(nativeQuestion.input).toBe(originalQuestion.input);
    expect(nativeQuestion.execute).toBe(originalQuestion.execute);
    expect(config).toMatchObject({ name: 'request', codemode: false, oauth: false });
    expect(asyncTool.options.permission).toBe('question');
    const client = new Client({ name: 'question-test', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } });
    cleanup.push(async () => { await transport.terminateSession(); await client.close(); });
    await client.connect(transport);
    const catalog = await client.listTools();
    expect(catalog.tools).toHaveLength(1);
    const tool = catalog.tools[0];
    expect(tool.name).toBe('user_input_async');
    expect(tool.description).toContain('immediately returns a receipt object');
    expect(tool.description).toContain('Awaiting this call waits for question creation; execution then continues in the same turn');
    expect(tool.inputSchema.properties.questions.items.properties.options).not.toHaveProperty('prefixItems');
    expect(tool.outputSchema.required).toEqual(['question_id', 'status', 'message']);
    const context = { sessionID: 'ses_1', agent: 'build', messageID: 'message', id: 'outer_script', signal: new AbortController().signal };
    const call = (title, sessionID = 'ses_1') => client.callTool({ name: tool.name, arguments: { questions: [{ title }] }, _meta: { 'ai.opencode/sessionID': sessionID } });
    const firstResult = await call('First question');
    expect(approve).toHaveBeenCalledWith({ action: 'question', resources: ['*'], save: ['*'] }, expect.any(AbortSignal));
    const secondResult = await call('Second question');
    const first = firstResult.structuredContent;
    const second = secondResult.structuredContent;
    expect(JSON.parse(firstResult.content[0].text)).toEqual(first);
    expect(JSON.parse(secondResult.content[0].text)).toEqual(second);
    expect(first).toMatchObject({ status: 'pending', message: expect.any(String) });
    expect(second).toMatchObject({ status: 'pending', message: expect.any(String) });
    expect(first.question_id).not.toBe(second.question_id);
    expect([...f.forms.values()].map(form => form.fields[0].title)).toEqual(['First question', 'Second question']);
    expect(f.delivered.size).toBe(0);
    const result = { output: first };
    await hooks.get('execute.after')({ ...context, tool: 'request_user_input_async', status: 'completed', result });
    expect(result.metadata.questionID).toBe(first.question_id);
    const other = await call('Other session', 'ses_2');
    expect(f.forms.get(other.structuredContent.question_id).sessionID).toBe('ses_2');
    await runtime.resolveBatch({ sessionID: 'ses_1', replies: [
      { questionID: first.question_id, status: 'answered', answer: { q0: 'Blue' } },
      { questionID: second.question_id, status: 'answered', answer: { q0: 'Green' } },
    ] });
    await vi.waitFor(() => expect(f.delivered.size).toBe(1));
    expect(JSON.parse([...f.delivered.values()][0].text).responses).toHaveLength(2);
    expect(f.forms.get(other.structuredContent.question_id).state.status).toBe('pending');
  });

  it('delivers a submitted question group in one message and preserves request order', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    const first = await runtime.ask(payload());
    const second = await runtime.ask(payload('call_2'));
    await runtime.resolveBatch({ sessionID: 'ses_1', replies: [
      { questionID: second.question_id, status: 'answered', answer: { q0: 'Green' } },
      { questionID: first.question_id, status: 'answered', answer: { q0: 'Blue' } },
    ] });
    await vi.waitFor(() => expect(f.delivered.size).toBe(1));
    expect(f.session.synthetic).toHaveBeenCalledTimes(1);
    const message = [...f.delivered.values()][0];
    expect(JSON.parse(message.text).responses).toEqual([
      { question_id: first.question_id, status: 'answered', answers: [{ question: 'Choose a color', answer: 'Blue' }] },
      { question_id: second.question_id, status: 'answered', answers: [{ question: 'Choose a color', answer: 'Green' }] },
    ]);
    expect(message).toMatchObject({ delivery: 'steer', resume: true });
  });

  it('validates every answer before committing any member of a group', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    const first = await runtime.ask(payload());
    const second = await runtime.ask(payload('call_2'));
    await expect(runtime.resolveBatch({ sessionID: 'ses_1', replies: [
      { questionID: first.question_id, status: 'answered', answer: { q0: 'Blue' } },
      { questionID: second.question_id, status: 'answered', answer: { wrong: 'Green' } },
    ] })).rejects.toThrow('Answer every question');
    const stored = JSON.parse(await fs.readFile(path.join(f.dataDir, 'async-questions.json')));
    expect(stored.map(entry => entry.resolution.status)).toEqual(['pending', 'pending']);
    expect(f.session.synthetic).not.toHaveBeenCalled();
    await expect(runtime.resolveBatch({ sessionID: 'ses_other', replies: [
      { questionID: first.question_id, status: 'cancelled' },
    ] })).rejects.toMatchObject({ status: 404 });
  });

  it('restores one durable batch after restart and deduplicates a lost delivery response', async () => {
    const f = await fixture();
    const before = f.runtime();
    const first = await before.ask(payload());
    const second = await before.ask(payload('call_2'));
    await before.resolveBatch({ sessionID: 'ses_1', replies: [
      { questionID: first.question_id, status: 'answered', answer: { q0: 'Blue' } },
      { questionID: second.question_id, status: 'answered', answer: { q0: 'Green' } },
    ] });
    await before.stop();
    f.forms.clear();
    const synthetic = f.session.synthetic.getMockImplementation();
    f.session.synthetic.mockImplementationOnce(async input => { await synthetic(input); throw new Error('Connection lost'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanup.push(() => vi.restoreAllMocks());
    const after = f.runtime();
    after.start();
    await vi.waitFor(() => expect(f.session.synthetic).toHaveBeenCalledTimes(2));
    expect(f.delivered.size).toBe(1);
    expect(f.session.synthetic.mock.calls[0][0].id).toBe(f.session.synthetic.mock.calls[1][0].id);
    expect(JSON.parse([...f.delivered.values()][0].text).responses).toHaveLength(2);
  });

  it('dismisses a question group with one cancellation delivery', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    const first = await runtime.ask(payload());
    const second = await runtime.ask(payload('call_2'));
    await runtime.resolveBatch({ sessionID: 'ses_1', replies: [
      { questionID: first.question_id, status: 'cancelled' },
      { questionID: second.question_id, status: 'cancelled' },
    ] });
    await vi.waitFor(() => expect(f.delivered.size).toBe(1));
    expect(JSON.parse([...f.delivered.values()][0].text).responses.map(reply => reply.status)).toEqual(['cancelled', 'cancelled']);
  });

  it('separates server stores by runtime, listener address and port', () => {
    const first = questionStoreDirectory('/data', 'web', '127.0.0.1', 3001);
    expect(questionStoreDirectory('/data', 'web', '127.0.0.1', 3001)).toBe(first);
    expect(questionStoreDirectory('/data', 'web', '::1', 3001)).not.toBe(first);
    expect(questionStoreDirectory('/data', 'desktop', '127.0.0.1', 3001)).not.toBe(first);
    expect(questionStoreDirectory('/data', 'web', '127.0.0.1', 3002)).not.toBe(first);
  });
  it('returns while unanswered and retains independently identified questions', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    const first = await runtime.ask(payload());
    const second = await runtime.ask(payload('call_2'));
    expect(first.status).toBe('pending');
    expect(second.question_id).not.toBe(first.question_id);
    expect(f.forms.size).toBe(2);
    expect(f.session.synthetic).not.toHaveBeenCalled();
    expect(f.forms.get(first.question_id)).toMatchObject({ metadata: { kind: 'openchamber-async-question' }, fields: [{ default: 'Blue', custom: true, title: 'Choose a color' }] });
    runtime.start();
    await runtime.resolve('ses_1', second.question_id, { status: 'answered', answer: { q0: 'Red' } });
    await vi.waitFor(() => expect(f.delivered.size).toBe(1));
    expect(f.forms.get(first.question_id).state.status).toBe('pending');
    expect([...f.delivered.values()][0]).toMatchObject({ delivery: 'steer', resume: true });
    expect([...f.delivered.values()][0].text).toContain('Red');
  });

  it('persists answers before settlement and deduplicates a lost delivery response', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    const question = await runtime.ask(payload());
    const synthetic = f.session.synthetic.getMockImplementation();
    f.session.synthetic.mockImplementationOnce(async input => { await synthetic(input); throw new Error('Connection lost'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanup.push(() => vi.restoreAllMocks());
    runtime.start();
    await runtime.resolve('ses_1', question.question_id, { status: 'answered', answer: { q0: 'Blue' } });
    const stored = JSON.parse(await fs.readFile(path.join(f.dataDir, 'async-questions.json')));
    expect(stored[0].resolution).toMatchObject({ status: 'answered', answer: { q0: 'Blue' } });
    await vi.waitFor(() => expect(f.session.synthetic).toHaveBeenCalledTimes(2));
    expect(f.delivered.size).toBe(1);
    expect(f.session.synthetic.mock.calls[0][0].id).toBe(f.session.synthetic.mock.calls[1][0].id);
    await vi.waitFor(async () => expect(JSON.parse(await fs.readFile(path.join(f.dataDir, 'async-questions.json')))).toEqual([]));
  });

  it('recreates pending forms after restart and delivers durable answers', async () => {
    const f = await fixture();
    const before = f.runtime();
    const one = await before.ask(payload());
    const two = await before.ask(payload('call_2'));
    await before.resolve('ses_1', one.question_id, { status: 'answered', answer: { q0: 'Blue' } });
    await before.stop();
    f.forms.clear();
    const after = f.runtime();
    after.start();
    await vi.waitFor(() => expect(f.delivered.size).toBe(1));
    await vi.waitFor(() => expect(f.forms.has(two.question_id)).toBe(true));
    expect(f.forms.get(two.question_id).state.status).toBe('pending');
  });

  it('cancels explicitly and records an archived answer without waking the session', async () => {
    const f = await fixture();
    f.archived.mockResolvedValue(true);
    const runtime = f.runtime();
    const question = await runtime.ask(payload());
    runtime.start();
    await runtime.resolve('ses_1', question.question_id, { status: 'cancelled' });
    await vi.waitFor(() => expect(f.delivered.size).toBe(1));
    const message = [...f.delivered.values()][0];
    expect(JSON.parse(message.text).status).toBe('cancelled');
    expect(message.resume).toBe(false);
  });

  it('observes direct native replies and reconnects after a missed event', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    runtime.start();
    const one = await runtime.ask(payload());
    const two = await runtime.ask(payload('call_2'));
    f.emit({ type: 'form.replied', data: { id: one.question_id, sessionID: 'ses_1', answer: { q0: 'Blue' } } });
    f.forms.get(two.question_id).state = { status: 'answered', answer: { q0: 'Green' } };
    f.reconnect();
    await vi.waitFor(() => expect(f.delivered.size).toBe(2));
  });

  it('rejects invalid answers and leaves other forms to their owner', async () => {
    const f = await fixture();
    const runtime = f.runtime();
    const question = await runtime.ask(payload());
    expect(await runtime.resolve('ses_other', question.question_id, { status: 'cancelled' })).toBe(false);
    expect(await runtime.resolve('ses_1', 'native_form', { status: 'cancelled' })).toBe(false);
    await expect(runtime.resolve('ses_1', question.question_id, { status: 'answered', answer: { wrong: 'Blue' } })).rejects.toThrow('Answer every question');
    await expect(runtime.resolve('ses_1', question.question_id, { status: 'answered', answer: undefined })).rejects.toThrow();
    expect(f.forms.get(question.question_id).state.status).toBe('pending');
  });

  it('preserves unreadable state and releases deleted sessions', async () => {
    const f = await fixture();
    const filename = path.join(f.dataDir, 'async-questions.json');
    await fs.writeFile(filename, 'malformed');
    await expect(f.runtime().ask(payload())).rejects.toThrow();
    expect(await fs.readFile(filename, 'utf8')).toBe('malformed');
    await fs.rm(filename);
    const runtime = f.runtime();
    await runtime.ask(payload());
    f.session.get.mockRejectedValue(missing());
    runtime.start();
    await vi.waitFor(async () => expect(JSON.parse(await fs.readFile(filename))).toEqual([]));
    expect(f.delivered.size).toBe(0);
  });
});
