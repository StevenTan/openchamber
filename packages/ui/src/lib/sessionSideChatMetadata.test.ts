import { describe, expect, test } from 'bun:test';
import type { Message, Metadata, Session } from '@/lib/opencode/model';
import { getSideChat, getSideChatSessionIDs, isTemporarySideChat, sideChatMessages, sideChatMetadata, withSideChatSaved, withSideChatSessionLink } from './sessionSideChatMetadata';
import { withoutSourceOwnedLinks } from './sessionForkInheritance';
import { orderVisibleRootSessions } from './sessionListOrder';

const session = (id: string, metadata: Metadata): Session => ({ id, metadata, projectID: 'p', directory: '/project', title: id, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: 1, updated: 1 } });
const record = (id: string, created: number) => ({ info: { id, sessionID: 'side', role: 'user', time: { created } } } satisfies { info: Message });
const boundary = { id: 'msg_fff', created: 100, synthetic: false };
const messageOf = (record: { info: Message }) => record.info;

describe('side chat persistence and visibility', () => {
  test('saving retains the inherited boundary and makes the session visible', () => {
    const temporary = session('side', sideChatMetadata('parent', boundary));
    const saved = session('side', withSideChatSaved(JSON.parse(JSON.stringify(temporary.metadata))));
    expect(isTemporarySideChat(temporary)).toBe(true);
    expect(orderVisibleRootSessions([temporary], new Set(), new Map())).toEqual([]);
    expect(isTemporarySideChat(saved)).toBe(false);
    expect(getSideChat(saved)?.boundary).toEqual(boundary);
    expect(orderVisibleRootSessions([saved], new Set(), new Map())).toEqual([saved]);
  });

  test('parent links retain independent chats and unrelated metadata', () => {
    let metadata: Metadata = { openchamber: { reviewSessionID: 'review' } };
    metadata = withSideChatSessionLink(metadata, 'a', true);
    metadata = withSideChatSessionLink(metadata, 'b', true);
    metadata = withSideChatSessionLink(metadata, 'a', false);
    expect(getSideChatSessionIDs(session('parent', metadata))).toEqual(['b']);
    expect(metadata.openchamber).toEqual({ reviewSessionID: 'review', sideChatSessions: { b: true } });
  });

  test('ordinary forks own neither the side chat boundary nor the source child links', () => {
    const metadata = withSideChatSessionLink(sideChatMetadata('parent', boundary), 'child', true);
    expect(withoutSourceOwnedLinks(metadata)).toEqual({});
  });
});

describe('side chat transcript projection', () => {
  test('hides inherited history and keeps the underlying transcript intact', () => {
    const records = [record('old', 50), record(boundary.id, 100), record('own', 200)];
    expect(sideChatMessages(records, boundary, messageOf)).toEqual([records[2]]);
    expect(records).toHaveLength(3);
  });

  test('pages without the boundary use transcript chronology across ID rollover', () => {
    const older = record('msg_ffffff', 90);
    const own = record('msg_000', 200);
    expect(sideChatMessages([older, own], boundary, messageOf)).toEqual([own]);
    expect(sideChatMessages([own], boundary, messageOf)).toEqual([own]);
  });

  test('an empty parent has no hidden messages', () => {
    const records = [record('first', 1)];
    expect(sideChatMessages(records, null, messageOf)).toBe(records);
    expect(getSideChat(session('side', sideChatMetadata(null, null)))?.parentSessionID).toBeUndefined();
  });
});
