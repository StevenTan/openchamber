import { z } from 'zod';
import type { SessionListOptions, SessionPage } from '@openchamber/sdk/conversations/http';
import type { ConversationApi } from './conversation-contract.js';

const backendCursors = z.record(z.string(), z.string());

export async function listConversations(backends: Array<{ id: string; api: ConversationApi }>, input: SessionListOptions): Promise<SessionPage> {
  const positions = input.cursor ? backendCursors.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString())) : undefined;
  const pages = await Promise.all(backends.filter(backend => !positions || backend.id in positions).map(async backend => ({
    id: backend.id,
    page: await backend.api.list({ ...input, cursor: positions?.[backend.id] }),
  })));
  const next = Object.fromEntries(pages.flatMap(({ id, page }) => page.cursor.next ? [[id, page.cursor.next]] : []));
  const spaces = pages.find(({ id }) => id === 'opencode')?.page.spaces;
  return {
    sessions: pages.flatMap(({ page }) => page.sessions),
    cursor: Object.keys(next).length ? { next: Buffer.from(JSON.stringify(next)).toString('base64url') } : {},
    ...spaces && { spaces },
  };
}
