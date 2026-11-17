import { describe, expect, test } from 'bun:test';
import type { Message, Part, Session, Metadata } from '@/lib/opencode/model';
import type { State } from './types';

import { EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT, buildUserMessageHistorySnapshot } from './user-message-history';
import { sideChatMetadata, withSideChatSaved } from '@/lib/sessionSideChatMetadata';

const message = (id: string, role: 'user' | 'assistant', created = 1): Message => ({
  id,
  role,
  sessionID: 'ses_1',
  time: { created },
} as Message);

const textPart = (id: string, text: string): Part => ({
  id,
  type: 'text',
  text,
} as Part);

const state = (partial: Partial<State>): Pick<State, 'session' | 'message' | 'part'> => ({
  session: [],
  message: {},
  part: {},
  ...partial,
});

const session = (metadata: Metadata): Session => ({
  id: 'ses_1', projectID: 'project', directory: '/repo', title: 'Session', cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 }, metadata,
});

describe('buildUserMessageHistorySnapshot', () => {
  test('returns a shared empty snapshot without a session id', () => {
    expect(buildUserMessageHistorySnapshot(state({}), '')).toBe(EMPTY_USER_MESSAGE_HISTORY_SNAPSHOT);
  });

  test('lists user prompts oldest first with their creation time', () => {
    const first = message('user_1', 'user', 10);
    const second = message('user_2', 'user', 20);
    const snapshot = buildUserMessageHistorySnapshot(
      state({
        message: { ses_1: [first, message('assistant_1', 'assistant', 15), second] },
        part: { user_1: [textPart('p1', 'first')], user_2: [textPart('p2', 'second')] },
      }),
      'ses_1',
    );

    expect(snapshot.history).toEqual([
      { text: 'first', createdAt: 10 },
      { text: 'second', createdAt: 20 },
    ]);
  });

  test('keeps history stable when assistant parts change', () => {
    const user = message('user_1', 'user');
    const assistant = message('assistant_1', 'assistant');
    const userParts = [textPart('part_user', 'hello')];
    const first = buildUserMessageHistorySnapshot(
      state({
        message: { ses_1: [user, assistant] },
        part: { user_1: userParts, assistant_1: [textPart('part_a', 'stream')] },
      }),
      'ses_1',
    );

    const second = buildUserMessageHistorySnapshot(
      state({
        message: { ses_1: [user, assistant] },
        part: { user_1: userParts, assistant_1: [textPart('part_a2', 'streaming')] },
      }),
      'ses_1',
      first,
    );

    expect(second).toBe(first);
    expect(second.history.map((prompt) => prompt.text)).toEqual(['hello']);
  });

  test('updates history when a user part changes', () => {
    const user = message('user_1', 'user');
    const first = buildUserMessageHistorySnapshot(
      state({
        message: { ses_1: [user] },
        part: { user_1: [textPart('part_user', 'hello')] },
      }),
      'ses_1',
    );

    const second = buildUserMessageHistorySnapshot(
      state({
        message: { ses_1: [user] },
        part: { user_1: [textPart('part_user_updated', 'updated')] },
      }),
      'ses_1',
      first,
    );

    expect(second).not.toBe(first);
    expect(second.history.map((prompt) => prompt.text)).toEqual(['updated']);
  });

  test('excludes user messages hidden by session revert state', () => {
    const beforeRevert = message('msg_ffffffffffffBefore', 'user');
    const reverted = message('msg_000000000000Reverted', 'user');

    const snapshot = buildUserMessageHistorySnapshot(
      state({
        session: [{ id: 'ses_1', revert: { messageID: reverted.id } } as State['session'][number]],
        message: { ses_1: [beforeRevert, reverted] },
        part: {
          [beforeRevert.id]: [textPart('part_user_1', 'kept')],
          [reverted.id]: [textPart('part_user_2', 'reverted')],
        },
      }),
      'ses_1',
    );

    expect(snapshot.history.map((prompt) => prompt.text)).toEqual(['kept']);
  });

  test('temporary and saved side chats recall only their own prompts', () => {
    const inherited = message('inherited', 'user', 10);
    const answer = message('answer', 'assistant', 20);
    const own = message('own', 'user', 30);
    const metadata = sideChatMetadata('parent', { id: answer.id, created: 20, synthetic: false });
    for (const value of [metadata, withSideChatSaved(metadata)]) {
      const snapshot = buildUserMessageHistorySnapshot(state({
        session: [session(value)],
        message: { ses_1: [inherited, answer, own] },
        part: { inherited: [textPart('p1', 'parent question')], own: [textPart('p2', 'side question')] },
      }), 'ses_1');
      expect(snapshot.history.map((prompt) => prompt.text)).toEqual(['side question']);
    }
  });

  test('a paged transcript excludes inherited prompts without loading the boundary', () => {
    const inherited = message('msg_ffffff', 'user', 10);
    const own = message('msg_000000', 'user', 30);
    const snapshot = buildUserMessageHistorySnapshot(state({
      session: [session(sideChatMetadata('parent', { id: 'boundary', created: 20, synthetic: false }))],
      message: { ses_1: [inherited, own] },
      part: { [inherited.id]: [textPart('p1', 'parent')], [own.id]: [textPart('p2', 'side')] },
    }), 'ses_1');
    expect(snapshot.history.map((prompt) => prompt.text)).toEqual(['side']);
  });

  test('an inherited boundary arriving with session metadata updates recall without changing messages', () => {
    const inherited = message('inherited', 'user', 10);
    const current = state({ message: { ses_1: [inherited] }, part: { inherited: [textPart('p', 'parent')] } });
    const previous = buildUserMessageHistorySnapshot(current, 'ses_1');
    const filtered = buildUserMessageHistorySnapshot({ ...current, session: [session(sideChatMetadata('parent', { id: 'boundary', created: 20, synthetic: false }))] }, 'ses_1', previous);
    expect(previous.history).toHaveLength(1);
    expect(filtered.history).toEqual([]);
  });
});
