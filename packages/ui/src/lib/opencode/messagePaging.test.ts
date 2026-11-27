import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { MessagePageItem } from './messagePaging';
import { opencodeClient } from './client';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '@/lib/runtime-url';
import { useAuthSessionStore } from '@/lib/runtime-auth-expiry';

// Pages are selected by cursor index, so a walk can be pinned without the flat
// records. A page's `next` is the next page's cursor; the last page has none.
type Page = { items: MessagePageItem[]; cursor: { next?: string } };
let pages: Page[] = [];
const calls: Array<{ cursor?: string; order?: 'asc' | 'desc'; limit?: number }> = [];

const previousFetch = globalThis.fetch;
const previousResolver = getRuntimeUrlResolver();
afterEach(() => {
  globalThis.fetch = previousFetch;
  setRuntimeUrlResolver(previousResolver);
  opencodeClient.reconnectToRuntimeBaseUrl();
});

const user = (id: string): MessagePageItem => ({
  info: { id, sessionID: 'ses_1', role: 'user', time: { created: 1 } },
  parts: [],
});
const plumbing = (id: string): MessagePageItem => ({
  info: { id, sessionID: 'ses_1', role: 'synthetic', text: '', time: { created: 1 } },
  parts: [],
});

describe('findMessagePageItem', () => {
  beforeEach(() => {
    pages = [];
    calls.length = 0;
    configureRuntimeUrlResolver({ apiBaseUrl: 'http://127.0.0.1:7878' });
    opencodeClient.reconnectToRuntimeBaseUrl();
    useAuthSessionStore.getState().markAuthenticated();
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (!url.pathname.startsWith('/api/conversations/')) return Response.json({ error: 'Session not found' }, { status: 404 });
      const cursor = url.searchParams.get('cursor') ?? undefined;
      const order = url.searchParams.get('order');
      const limit = url.searchParams.get('limit');
      calls.push({ cursor, order: order === 'asc' || order === 'desc' ? order : undefined, limit: limit === null ? undefined : Number(limit) });
      return Response.json(pages[Number(cursor ?? '0')]);
    };
  });

  test('finds a record past the first page', async () => {
    const { findMessagePageItem } = await import('./messagePaging');
    pages = [
      { items: [plumbing('p1'), plumbing('p2')], cursor: { next: '1' } },
      { items: [user('u1')], cursor: {} },
    ];

    const found = await findMessagePageItem('ses_1', (item) => item.info.role === 'user', { order: 'asc', limit: 10 });

    expect(found?.info.id).toBe('u1');
    expect(calls.map((call) => call.cursor)).toEqual([undefined, '1']);
    expect(calls[0]?.order).toBe('asc');
  });

  test('stops on a repeated cursor instead of looping', async () => {
    const { findMessagePageItem } = await import('./messagePaging');
    pages = [
      { items: [plumbing('p1')], cursor: { next: '1' } },
      { items: [plumbing('p2')], cursor: { next: '1' } },
    ];

    const found = await findMessagePageItem('ses_1', (item) => item.info.role === 'user');

    expect(found).toBeNull();
    expect(calls).toHaveLength(2);
  });

  test('returns null when the history runs out', async () => {
    const { findMessagePageItem } = await import('./messagePaging');
    pages = [{ items: [plumbing('p1')], cursor: {} }];

    expect(await findMessagePageItem('ses_1', (item) => item.info.role === 'user')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  test('reads an Antigravity answer outside the loaded message window', async () => {
    const { findMessagePageItem } = await import('./messagePaging');
    const answer: MessagePageItem = {
      info: { id: 'answer', sessionID: 'ses_ag_parent', role: 'assistant', agent: 'antigravity', providerID: 'antigravity', modelID: 'gemini-hydrogen', time: { created: 1, completed: 2 }, finish: 'stop' },
      parts: [],
    };
    pages = [
      { items: [plumbing('context')], cursor: { next: '1' } },
      { items: [answer], cursor: {} },
    ];
    expect(await findMessagePageItem('ses_ag_parent', item => item.info.role === 'assistant', { limit: 30 }, '/repo')).toEqual(answer);
    expect(calls).toHaveLength(2);
  });
});
