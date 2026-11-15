import { expect, it, vi } from 'vitest';
import { CodexWebSearchProvider } from './src/vendor/codex-provider.ts';

const options = { endpoint: 'https://search.example/v1/alpha/search', credentials: { accessToken: 'private-key' }, model: 'configured-model', sessionId: 'session-a' };

it('rejects malformed successful responses instead of reporting an empty search', async () => {
  const provider = new CodexWebSearchProvider({ ...options, customFetch: vi.fn(async () => Response.json({ error: 'bad response' })) });
  await expect(provider.search({ query: 'docs' })).rejects.toThrow('Invalid Codex search response');
});

it('redacts the configured credential in backend errors', async () => {
  const provider = new CodexWebSearchProvider({ ...options, customFetch: vi.fn(async () => new Response('Invalid private-key', { status: 400 })) });
  await expect(provider.search({ query: 'docs' })).rejects.toThrow('HTTP 400: Invalid [redacted]');
});

it('cancels a transient retry without sending another request', async () => {
  const abort = new AbortController();
  const fetcher = vi.fn(async () => new Response('', { status: 503 }));
  const provider = new CodexWebSearchProvider({ ...options, customFetch: fetcher });
  const request = provider.search({ query: 'docs' }, abort.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  abort.abort();
  await expect(request).rejects.toThrow('cancelled');
  expect(fetcher).toHaveBeenCalledOnce();
});

it('honors request deadlines and releases the caller abort listener', async () => {
  const abort = new AbortController();
  const remove = vi.spyOn(abort.signal, 'removeEventListener');
  const provider = new CodexWebSearchProvider({ ...options, timeoutMs: 10, customFetch: vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))) });
  await expect(provider.search({ query: 'docs' }, abort.signal)).rejects.toThrow('timed out');
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
