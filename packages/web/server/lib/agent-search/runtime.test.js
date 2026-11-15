import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { materializeSearchPlugin } from './runtime.js';

let root, server, tools, hooks, context, requests, selection, transformSearch, provider, native;
const invocation = (sessionID = 'session-a') => ({ sessionID, agent: 'build', messageID: 'message', id: 'call', signal: new AbortController().signal, progress: vi.fn(async () => {}) });

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-search-'));
  requests = [];
  server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const command = JSON.parse(body);
    requests.push({ path: req.url, authorization: req.headers.authorization, ...command });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ output: 'Source text citeturn0search0', results: [{ ref_id: 'turn0search0', title: 'Docs', url: 'https://example.com/docs', snippet: 'Source text' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  provider = { id: 'proxy', settings: { apiKey: 'fixture-key', baseURL }, headers: { authorization: 'stale-header' } };
  selection = 'native';
  tools = new Map(); hooks = new Map();
  context = {
    options: {},
    provider: { list: vi.fn(async () => ({ data: [provider] })) },
    model: {
      list: vi.fn(async () => ({ data: [
        { providerID: 'other', modelID: 'unrelated', settings: { websearch: false, baseURL: 'provider-specific' }, enabled: true },
        { providerID: 'proxy', modelID: 'configured-model', settings: {}, enabled: true },
      ] })),
      default: vi.fn(async () => ({ data: { providerID: 'proxy', modelID: 'configured-model' } })),
    },
    permission: { assert: vi.fn(async () => {}) },
    websearch: {
      providers: vi.fn(async () => ({ data: [{ id: 'native' }] })),
      transform: async transform => {
        transformSearch = () => transform({ add: value => { native = value; }, default: { get: () => selection, set: value => { selection = value; } } });
        transformSearch();
      },
    },
    tool: { transform: async transform => transform({ add: tool => tools.set(tool.name, tool) }) },
    session: {
      context: vi.fn(async () => [
        { id: 'user', type: 'user', text: 'Find the official docs', time: { created: 1 } },
        { id: 'message', type: 'assistant', model: { providerID: 'proxy', id: 'configured-model' }, content: [], time: { created: 2 } },
      ]),
      hook: async (name, callback) => { hooks.set(name, callback); },
    },
  };
  const directory = await materializeSearchPlugin(root);
  const plugin = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  await plugin.default.setup(context);
});

afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
});

it('loads a self-contained materialized plugin and follows references within each session', async () => {
  const result = await tools.get('codex-search').execute({ query: 'current docs' }, invocation());
  expect(result.content).toContain('turn0search0');
  expect(result.content).toContain('](https://example.com/docs)');
  expect(result.content).not.toContain('\u001b');
  expect(result.metadata.command).toEqual({ search_query: [{ q: 'current docs' }], response_length: 'short' });
  await tools.get('codex-research').execute({ open: [{ ref_id: 'turn0search0' }] }, invocation());
  await tools.get('codex-research').execute({ find: [{ ref_id: 'turn0search0', pattern: 'Docs' }], click: [{ ref_id: 'turn0search0', id: 2 }] }, invocation());
  await tools.get('codex-search').execute({ query: 'another session' }, invocation('session-b'));
  expect(requests.map(request => request.id)).toEqual(['openchamber_session-a', 'openchamber_session-a', 'openchamber_session-a', 'openchamber_session-b']);
  expect(requests.every(request => request.path === '/v1/alpha/search' && request.model === 'configured-model' && request.authorization === 'Bearer fixture-key')).toBe(true);
  expect(requests[1].commands.open).toEqual([{ ref_id: 'turn0search0' }]);
  expect(context.permission.assert).toHaveBeenCalledWith(expect.objectContaining({ action: 'websearch', sessionID: 'session-a', source: { type: 'tool', messageID: 'message', id: 'call' } }));
});

it.each(['context', 'generate', 'compaction'])('offers research tools for native selection in %s requests', async name => {
  const event = { tools: { websearch: {}, 'codex-search': {}, 'codex-research': {}, webfetch: {} } };
  await hooks.get(name)(event);
  expect(Object.keys(event.tools)).toEqual(['codex-search', 'codex-research', 'webfetch']);
});

it.each([false, 'exa'])('respects search selection %s on catalog reload and execution', async value => {
  transformSearch(); selection = value;
  const event = { tools: { websearch: {}, 'codex-search': {}, 'codex-research': {} } };
  await hooks.get('context')(event);
  expect(Object.keys(event.tools)).toEqual(['websearch']);
  await expect(tools.get('codex-search').execute({ query: 'blocked' }, invocation())).rejects.toThrow('Select Codex search');
  expect(requests).toEqual([]);
});

it('enforces provider policy and permissions before sending a search', async () => {
  context.websearch.providers.mockResolvedValue({ data: [] });
  await expect(tools.get('codex-search').execute({ query: 'blocked' }, invocation())).rejects.toThrow('Select Codex search');
  context.websearch.providers.mockResolvedValue({ data: [{ id: 'native' }] });
  context.permission.assert.mockRejectedValue(new Error('Permission denied'));
  await expect(tools.get('codex-search').execute({ query: 'blocked' }, invocation())).rejects.toThrow('Permission denied');
  expect(requests).toEqual([]);
});

it('reads updated provider settings and the pinned search model at invocation time', async () => {
  provider.settings.apiKey = 'updated-key';
  context.model.list.mockResolvedValue({ data: [{ providerID: 'proxy', modelID: 'search-model', enabled: true, settings: { websearch: 'always', baseURL: provider.settings.baseURL + '/search-route' } }] });
  await tools.get('codex-search').execute({ query: 'route' }, invocation());
  expect(requests[0]).toMatchObject({ path: '/v1/search-route/alpha/search', authorization: 'Bearer updated-key', model: 'search-model' });
});

it('fails clearly for missing proxy credentials without printing their values', async () => {
  delete provider.settings.apiKey;
  await expect(tools.get('codex-search').execute({ query: 'docs' }, invocation())).rejects.toThrow('requires a provider baseURL and API key');
  expect(requests).toEqual([]);
});

it('uses a model-level proxy URL when the provider only configures credentials', async () => {
  const baseURL = provider.settings.baseURL;
  delete provider.settings.baseURL;
  context.model.list.mockResolvedValue({ data: [{ providerID: 'proxy', modelID: 'configured-model', enabled: true, settings: { baseURL } }] });
  await tools.get('codex-search').execute({ query: 'model URL' }, invocation());
  expect(requests[0].path).toBe('/v1/alpha/search');
});

it('serves ordinary OpenCode search-provider queries through the standalone protocol', async () => {
  const result = await native.execute({ query: 'docs' }, { signal: new AbortController().signal });
  expect(result).toEqual([{ url: 'https://example.com/docs', title: 'Docs', content: 'Source text', time: {} }]);
  expect(requests[0].commands).toEqual({ search_query: [{ q: 'docs' }] });
});

it('uses the current assistant model and sends only recent visible conversation text', async () => {
  context.session.context.mockResolvedValue([
    { id: 'old', type: 'user', text: 'Discarded old user' },
    { id: 'previous', type: 'user', text: 'Previous user', files: [{ secret: 'file bytes' }] },
    { id: 'reply', type: 'assistant', content: [{ type: 'text', text: 'Previous reply' }, { type: 'reasoning', text: 'Private reasoning' }, { type: 'tool', state: { content: 'File contents' } }] },
    { id: 'system', type: 'system', text: 'System secret' },
    { id: 'user', type: 'user', text: 'Current user' },
    { id: 'message', type: 'assistant', model: { providerID: 'proxy', id: 'chat-model' }, content: [{ type: 'text', text: 'Current commentary' }] },
    { id: 'future', type: 'user', text: 'Future input' },
  ]);
  await tools.get('codex-search').execute({ query: 'docs' }, invocation());
  expect(requests[0].model).toBe('chat-model');
  expect(requests[0].input.map(message => message.content[0].text)).toEqual(['Previous user', 'Previous reply', 'Current user']);
  expect(requests[0].max_output_tokens).toBe(10000);
});

it('forwards search controls and specialized commands without including them in commands metadata', async () => {
  expect(tools.get('codex-research').input.properties).not.toHaveProperty('literature_search_query');
  expect(tools.get('codex-research').input.properties.sports.items.required).not.toContain('tool');
  await tools.get('codex-research').execute({
    image_query: [{ q: 'otter', domains: ['example.com'] }], screenshot: [{ ref_id: 'https://example.com/a.pdf', pageno: 0 }],
    finance: [{ ticker: 'MSFT', type: 'equity', market: 'USA' }], weather: [{ location: 'Beijing' }],
    sports: [{ fn: 'standings', league: 'nba' }], time: [{ utc_offset: '+08:00' }],
    mode: 'indexed', max_output_tokens: 2500, search_context_size: 'high',
    user_location: { country: 'CN', timezone: 'Asia/Shanghai' }, allowed_domains: ['example.com'], blocked_domains: ['blocked.example'],
  }, invocation());
  expect(Object.keys(requests[0].commands)).toEqual(['response_length', 'image_query', 'screenshot', 'finance', 'weather', 'sports', 'time']);
  expect(requests[0].commands.sports).toEqual([{ tool: 'sports', fn: 'standings', league: 'nba' }]);
  expect(requests[0]).toMatchObject({ max_output_tokens: 2500, settings: {
    external_web_access: 'indexed', search_context_size: 'high',
    user_location: { type: 'approximate', country: 'CN', timezone: 'Asia/Shanghai' },
    filters: { allowed_domains: ['example.com'], blocked_domains: ['blocked.example'] }, allowed_callers: ['direct'],
  } });
});
