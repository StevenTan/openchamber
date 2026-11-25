import { expect, test } from 'bun:test';
import type { AcpConversation } from '@openchamber/sdk/agent-backends';
import { createAntigravityAdapter } from './antigravity';

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
  globalThis.fetch = async () => Response.json(session);
  try {
    const client = createAntigravityAdapter().client;
    const page = await client.getSessionMessages(session.id);
    expect(page.items.map(item => item.info.role)).toEqual(['assistant', 'user']);
    expect(page.items[0]?.parts).toMatchObject([{ type: 'text', text: 'Reply' }]);
    expect(await client.getSessionMessage(session.id, 'assistant')).toEqual(page.items[0]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
