import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createAntigravityAdapter } from './antigravity';
import { acpMessages } from './antigravity-projection';
import type { AcpConversation } from '@openchamber/sdk/agent-backends';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '../runtime-url';
import { opencodeClient } from '../opencode/client';

const previousResolver = getRuntimeUrlResolver();
beforeEach(() => { configureRuntimeUrlResolver({ apiBaseUrl: 'http://127.0.0.1' }); opencodeClient.reconnectToRuntimeBaseUrl(); });
afterEach(() => { setRuntimeUrlResolver(previousResolver); opencodeClient.reconnectToRuntimeBaseUrl(); });

const session: AcpConversation = {
  id: 'ses_ag_history', nativeID: 'native', title: 'Test', directory: '/project',
  created: 1, updated: 4, draft: false, config: [],
  turns: [{
    id: 'user', assistantID: 'assistant', modelID: 'model', text: 'Hello', files: [],
    created: 1, completed: 4, followups: [],
    updates: [{ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Reply' } }],
  }],
};
test('message pages return newest first while individual messages retain their parts', async () => {
  const previousFetch = globalThis.fetch;
  const messages = session.turns.flatMap(turn => acpMessages(session, turn)).reverse();
  const paths: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return Response.json(url.pathname.endsWith('/message') ? { items: messages, cursor: {} } : messages.find(item => item.info.id === url.pathname.split('/').at(-1)));
  };
  try {
    const client = createAntigravityAdapter().client;
    const page = await client.getSessionMessages(session.id);
    expect(page.items.map(item => item.info.role)).toEqual(['assistant', 'user']);
    expect(page.items[0]?.parts).toMatchObject([{ type: 'text', text: 'Reply' }]);
    expect(await client.getSessionMessage(session.id, 'assistant')).toEqual(page.items[0]);
    expect(paths).toEqual([`/api/conversations/${session.id}/message`, `/api/conversations/${session.id}/message/assistant`]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('native sends admit context after revert and invoke beforeSend immediately before the prompt', async () => {
  const previousFetch = globalThis.fetch;
  const order: string[] = [];
  let sent: { context: Array<{ text: string }>; text: string; files: Array<{ url: string }> } | undefined;
  globalThis.fetch = async (input, init) => {
    const endpoint = new URL(String(input)).pathname.split('/').at(-1)!;
    order.push(endpoint);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (endpoint === 'skills') return Response.json({ attached: [], unresolved: ['pdf'] });
    if (endpoint === 'context') return Response.json([body]);
    if (endpoint === 'prompt') sent = body;
    return Response.json(null);
  };
  try {
    const client = createAntigravityAdapter().client;
    const id = await client.sendMessage({ id: session.id, messageId: 'msg_send', providerID: 'antigravity', text: 'Continue',
      model: { providerID: 'antigravity', id: 'model' }, context: [{ text: 'History' }],
      skills: { names: ['pdf'], instructionFor: names => names.length ? 'Use pdf' : null },
      files: [{ type: 'file', mime: 'application/json', url: 'data:application/json;base64,e30=' }],
      commitRevert: async () => { order.push('revert'); }, beforeSend: () => { order.push('beforeSend'); },
    });
    expect(id).toBe('msg_send');
    expect(order).toEqual(['model', 'skills', 'revert', 'context', 'context', 'beforeSend', 'prompt']);
    expect(sent?.context.map(item => item.text)).toEqual(['History', 'Use pdf']);
    expect(sent?.text).toBe('Continue');
    expect(sent?.files[0]?.url).toBe('data:text/plain;base64,e30=');
  } finally { globalThis.fetch = previousFetch; }
});
