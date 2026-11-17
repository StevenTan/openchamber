import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { materializeSearchPlugin } from './runtime.js';

let root, server, context, provider, requests, tool, hooks, native, selection, backendResponse, status;
let cleanupPlugin;
let registered;
let replaySearch;
const invocation = (sessionID = 'session-a') => ({ sessionID, agent: 'build', messageID: 'message', id: 'call', signal: new AbortController().signal, progress: vi.fn(async () => {}) });

async function setup(options = {}) {
  await cleanupPlugin?.();
  context.options = options;
  const directory = await materializeSearchPlugin(root);
  const { default: plugin } = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  cleanupPlugin = await plugin.setup(context);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-search-'));
  requests = [];
  status = 200;
  backendResponse = {
    output: '  Source text citeturn0search0\nImage URL: https://missing.invalid/image.jpg\n',
    results: [{ type: 'future_result', ref_id: 'turn0search0', url: 'https://example.com/docs', title: 'Docs', snippet: 'Source', extra: { images: [{ source: 'opaque' }], count: 3 } }],
  };
  server = http.createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    requests.push({ path: req.url, authorization: req.headers.authorization, ...JSON.parse(text) });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(backendResponse));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  provider = { id: 'proxy', settings: { apiKey: 'fixture-key', baseURL: `http://127.0.0.1:${server.address().port}/v1` }, headers: { authorization: 'stale' } };
  selection = 'native';
  hooks = new Map();
  registered = new Map();
  let transformTool;
  const replayTools = async () => {
    registered.clear();
    registered.set('websearch', {});
    transformTool({ namespace() {}, remove: id => registered.delete(id), add: value => { tool = value; registered.set('web_run', value); } });
  };
  context = {
    options: {},
    provider: { list: vi.fn(async () => ({ data: [provider] })) },
    model: {
      list: vi.fn(async () => ({ data: [{ providerID: 'proxy', modelID: 'chat-model', enabled: true, settings: {} }] })),
      default: vi.fn(async () => ({ data: { providerID: 'proxy', modelID: 'global-model' } })),
    },
    permission: { assert: vi.fn(async () => {}) },
    websearch: {
      providers: vi.fn(async () => ({ data: [{ id: 'native' }] })),
      transform: async transform => {
        replaySearch = () => transform({ add: value => { native = value; }, default: { get: () => selection, set: value => { selection = value; } } });
        replaySearch();
      },
    },
    tool: { reload: replayTools, transform: async transform => { transformTool = transform; await replayTools(); } },
    event: { subscribe: async function* ({ signal }) { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); } },
    session: {
      context: vi.fn(async () => [
        { id: 'user', type: 'user', text: 'Find the docs' },
        { id: 'message', type: 'assistant', model: { providerID: 'proxy', id: 'chat-model' }, content: [] },
      ]),
      hook: async (name, callback) => { hooks.set(name, callback); },
    },
  };
  await setup();
});

afterEach(async () => {
  await cleanupPlugin();
  cleanupPlugin = undefined;
  await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
});

it('registers only the selected search implementation and removes both when disabled', async () => {
  expect([...registered.keys()]).toEqual(['web_run']);
  selection = 'other';
  context.websearch.providers.mockResolvedValue({ data: [{ id: 'native' }, { id: 'other' }] });
  await hooks.get('prompt')();
  expect([...registered.keys()]).toEqual(['websearch']);
  selection = false;
  await hooks.get('prompt')();
  expect([...registered.keys()]).toEqual([]);
  selection = 'native';
  await hooks.get('prompt')();
  expect([...registered.keys()]).toEqual(['web_run']);
  selection = 'random';
  await hooks.get('prompt')();
  expect([...registered.keys()]).toEqual(['websearch']);
});

it('reads selection after the provider registry refreshes its transforms', async () => {
  selection = 'other';
  context.websearch.providers.mockImplementationOnce(async () => {
    selection = 'native';
    return { data: [{ id: 'native' }, { id: 'other' }] };
  });
  await hooks.get('prompt')();
  expect([...registered.keys()]).toEqual(['web_run']);
});

it('refreshes search tools when selection changes during a running turn', async () => {
  await hooks.get('prompt')();
  selection = false;
  replaySearch();
  expect([...registered.keys()]).toEqual([]);
  selection = 'native';
  replaySearch();
  expect([...registered.keys()]).toEqual(['web_run']);
});

it('returns the backend text verbatim and preserves opaque result variants outside model content', async () => {
  const result = await tool.execute({ image_query: [{ q: 'waterfall' }] }, invocation());
  expect(result.content).toBe(backendResponse.output);
  expect(result.metadata.results).toEqual(backendResponse.results);
  expect(result.content).toBeTypeOf('string');
  expect(result).not.toHaveProperty('output');
});

it('sends mixed operations once without changing query text or supplying response_length', async () => {
  const command = { search_query: [{ q: ' docs ', recency: 0, domains: ['example.com'] }], open: [{ ref_id: 'https://example.com/pdf', lineno: 0 }], click: [{ ref_id: 'turn0view0', id: 0 }], find: [{ ref_id: 'turn0view0', pattern: '' }], image_query: [{ q: 'waterfall' }], finance: [{ ticker: 'MSFT', type: 'equity', market: 'USA' }], time: [{ utc_offset: '+08:00' }] };
  await tool.execute(command, invocation());
  expect(requests).toHaveLength(1);
  expect(requests[0].commands).toEqual(command);
  expect(requests[0]).toMatchObject({ path: '/v1/alpha/search', authorization: 'Bearer fixture-key', model: 'chat-model', max_output_tokens: 10000, settings: { allowed_callers: ['direct'] } });
});

it('keeps backend references scoped to the owning session', async () => {
  await tool.execute({ search_query: [{ q: 'docs' }] }, invocation());
  await tool.execute({ open: [{ ref_id: 'turn0search0' }] }, invocation());
  await tool.execute({ search_query: [{ q: 'other' }] }, invocation('session-b'));
  expect(requests.map(request => request.id)).toEqual(['openchamber_session-a', 'openchamber_session-a', 'openchamber_session-b']);
});

it('uses the invoking model and reads credentials and model URL at call time', async () => {
  provider.settings.apiKey = 'updated-key';
  context.model.list.mockResolvedValue({ data: [
    { providerID: 'proxy', modelID: 'different-model', enabled: true, settings: { websearch: 'always' } },
    { providerID: 'proxy', modelID: 'chat-model', enabled: true, settings: { baseURL: provider.settings.baseURL + '/model' } },
  ] });
  await tool.execute({ search_query: [{ q: 'docs' }] }, invocation());
  expect(requests[0]).toMatchObject({ model: 'chat-model', path: '/v1/model/alpha/search', authorization: 'Bearer updated-key' });
});

it('takes search settings and the output budget from plugin configuration', async () => {
  await setup({ web_search: 'cached', web_search_config: { user_location: { country: 'CN' }, search_context_size: 'high', filters: { allowed_domains: ['example.com'] } }, tool_output_token_limit: 12000 });
  await tool.execute({ search_query: [{ q: 'docs' }] }, invocation());
  expect(requests[0]).toMatchObject({ max_output_tokens: 12000, settings: { allowed_callers: ['direct'], external_web_access: false, user_location: { type: 'approximate', country: 'CN' }, search_context_size: 'high', filters: { allowed_domains: ['example.com'] } } });
});

it.each(['literature_search_query', 'weather', 'sports', 'screenshot', 'max_output_tokens', 'mode', 'allowed_domains', 'blocked_domains', 'user_location', 'search_context_size'])('rejects unsupported query field %s before requesting the backend', async field => {
  expect(tool.input.properties).not.toHaveProperty(field);
  await expect(tool.execute({ [field]: [] }, invocation())).rejects.toThrow();
  expect(requests).toEqual([]);
});

it('checks the selected implementation when a saved invocation starts', async () => {
  selection = false;
  await expect(tool.execute({}, invocation())).rejects.toThrow('Select Codex search');
  expect(requests).toEqual([]);
});

it('checks search-provider policy and invocation permissions before sending requests', async () => {
  context.websearch.providers.mockResolvedValue({ data: [] });
  await expect(tool.execute({}, invocation())).rejects.toThrow('Select Codex search');
  context.websearch.providers.mockResolvedValue({ data: [{ id: 'native' }] });
  context.permission.assert.mockRejectedValue(new Error('Permission denied'));
  await expect(tool.execute({}, invocation())).rejects.toThrow('Permission denied');
  expect(requests).toEqual([]);
});

it('preserves HTTP failure details while redacting credentials and permits later searches', async () => {
  status = 404;
  backendResponse = { error: 'Missing fixture-key' };
  await expect(tool.execute({ open: [{ ref_id: 'https://missing.invalid/' }] }, invocation())).rejects.toThrow('HTTP 404');
  await expect(tool.execute({}, invocation())).rejects.toThrow('Missing [redacted]');
  status = 200;
  backendResponse = { output: 'next search succeeded', results: null };
  expect((await tool.execute({}, invocation())).content).toBe('next search succeeded');
});

it('rejects malformed success responses instead of returning empty success', async () => {
  backendResponse = { results: [] };
  await expect(tool.execute({}, invocation())).rejects.toThrow('invalid response');
});

it('adapts search hits only at the native OpenCode provider boundary', async () => {
  const result = await native.execute({ query: 'docs' }, { signal: new AbortController().signal });
  expect(result).toEqual([{ url: 'https://example.com/docs', title: 'Docs', content: 'Source', time: {} }]);
  expect(requests[0].model).toBe('global-model');
});
