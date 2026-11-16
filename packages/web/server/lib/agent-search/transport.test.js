import { afterEach, expect, it, vi } from 'vitest';
import { requestSearch } from './src/request.ts';
import { options } from './src/commands.ts';

const backend = { baseURL: 'https://search.example/v1', apiKey: 'private-key', model: 'model' };
const command = { search_query: [{ q: 'docs' }] };
const success = () => Response.json({ output: 'Search result', results: [] });
const search = (signal = new AbortController().signal, overrides = {}) => requestSearch({ ...backend, ...overrides }, 'session', command, options.parse({}), signal);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('retries a server failure within the same search request', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('temporary', { status: 503, headers: { 'Retry-After': '0' } })).mockImplementationOnce(async () => success());
  vi.stubGlobal('fetch', fetcher);
  expect((await search()).output).toBe('Search result');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([
    expect.objectContaining({ id: 'session', commands: command }),
    expect.objectContaining({ id: 'session', commands: command }),
  ]);
});

it('stops after four retries and keeps the final HTTP failure', async () => {
  const fetcher = vi.fn(async () => new Response('unavailable', { status: 500, headers: { 'Retry-After': '0' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(search()).rejects.toThrow('HTTP 500');
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it.each([400, 401, 403, 404, 408, 429])('returns HTTP %s without a request-layer retry', async status => {
  const fetcher = vi.fn(async () => new Response('private-key rejected', { status }));
  vi.stubGlobal('fetch', fetcher);
  await expect(search()).rejects.toThrow(`HTTP ${status}): [redacted] rejected`);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('retries a connection failure', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockImplementationOnce(async () => success());
  vi.stubGlobal('fetch', fetcher);
  expect((await search()).output).toBe('Search result');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('retries a connection interrupted while reading the response body', async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new TypeError('connection reset')); } });
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(body)).mockImplementationOnce(async () => success());
  vi.stubGlobal('fetch', fetcher);
  expect((await search()).output).toBe('Search result');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('retries an attempt timeout with a fresh timeout signal', async () => {
  const fetcher = vi.fn().mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  })).mockImplementationOnce(async () => success());
  vi.stubGlobal('fetch', fetcher);
  expect((await search(undefined, { timeout: 10 })).output).toBe('Search result');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(false);
});

it('cancels a backoff wait without sending another attempt', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(async () => new Response('temporary', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const pending = search(controller.signal);
  const rejected = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort();
  await rejected;
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(['{invalid', JSON.stringify({ output: 3 })])('does not retry invalid response data', async body => {
  const fetcher = vi.fn(async () => new Response(body));
  vi.stubGlobal('fetch', fetcher);
  await expect(search()).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});
