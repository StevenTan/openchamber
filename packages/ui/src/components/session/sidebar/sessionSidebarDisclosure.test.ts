import { describe, expect, test } from 'bun:test';
import type { SessionSidebarActivityKey, SessionSidebarRow } from './sessionSidebarRowModel';
import { findSessionSidebarDisclosure, sessionSidebarDisclosureBounds } from './sessionSidebarDisclosure';

test('the final section opens toward the list tail and closes back to its caption', () => {
  const closed = [{ start: 0, end: 28 }];
  const opened = [...closed, { start: 28, end: 60 }, { start: 60, end: 92 }];
  const disclosure = { opened: true, previousHeaderIndex: 0, nextHeaderIndex: 0, blockStart: 1, blockEnd: 3 };
  expect(sessionSidebarDisclosureBounds(disclosure, closed, opened)).toEqual({ from: 28, to: 92, shift: 0 });
  expect(sessionSidebarDisclosureBounds({ ...disclosure, opened: false }, opened, closed)).toEqual({ from: 92, to: 28, shift: 0 });
});

const header = (activityKey: SessionSidebarActivityKey, collapsed: boolean): SessionSidebarRow => ({
  kind: 'activity-header',
  key: `activity:${activityKey}`,
  estimateSize: 28,
  activityKey,
  collapsed,
});

const child = (key: string): Extract<SessionSidebarRow, { kind: 'show-control' }> => ({
  kind: 'show-control',
  key,
  estimateSize: 20,
  more: true,
  fewer: false,
  hiddenNodes: [],
  containerKey: key,
  currentCount: 7,
  requestedCount: 7,
  increment: 7,
});

// SAFETY: the disclosure reads only a row's kind, key and expansion fields.
const sessionRow = (key: string, expanded?: boolean): SessionSidebarRow => ({
  kind: 'session',
  key,
  estimateSize: 34,
  expanded,
} as SessionSidebarRow);

describe('findSessionSidebarDisclosure', () => {
  test('finds the subsessions a session row opened, so they animate as a header\'s rows do', () => {
    const previous = [sessionRow('s1', false), sessionRow('s2')];
    const next = [sessionRow('s1', true), child('s1-a'), child('s1-b'), sessionRow('s2')];

    expect(findSessionSidebarDisclosure(previous, next)).toEqual({
      opened: true,
      previousHeaderIndex: 0,
      nextHeaderIndex: 0,
      blockStart: 1,
      blockEnd: 3,
    });
  });

  test('finds the rows a header opened', () => {
    const previous = [header('chats', true), header('work', false), child('w1')];
    const next = [header('chats', false), child('c1'), child('c2'), header('work', false), child('w1')];

    expect(findSessionSidebarDisclosure(previous, next)).toEqual({
      opened: true,
      previousHeaderIndex: 0,
      nextHeaderIndex: 0,
      blockStart: 1,
      blockEnd: 3,
    });
  });

  test('finds the rows a header closed, at the end of the list too', () => {
    const previous = [header('chats', false), child('c1'), header('work', false), child('w1'), child('w2')];
    const next = [header('chats', false), child('c1'), header('work', true)];

    expect(findSessionSidebarDisclosure(previous, next)).toEqual({
      opened: false,
      previousHeaderIndex: 2,
      nextHeaderIndex: 2,
      blockStart: 3,
      blockEnd: 5,
    });
  });

  test('ignores several headers changing at once, as Collapse all does', () => {
    const previous = [header('chats', false), child('c1'), header('work', false), child('w1')];
    const next = [header('chats', true), header('work', true)];

    expect(findSessionSidebarDisclosure(previous, next)).toBeNull();
  });

  test('ignores a search replacing the headers with its results', () => {
    const previous = [header('chats', true), header('work', false), child('w1')];
    const next: SessionSidebarRow[] = [{ kind: 'search-archived-caption', key: 'search:archived', estimateSize: 34 }, { kind: 'search-more', key: 'search:archived:page', estimateSize: 36, section: 'archived' }];

    expect(findSessionSidebarDisclosure(previous, next)).toBeNull();
  });

  test('ignores a header that changed with nothing under it', () => {
    const previous = [header('chats', true), header('work', false)];
    const next = [header('chats', false), header('work', false)];

    expect(findSessionSidebarDisclosure(previous, next)).toBeNull();
  });

  test('ignores a change that is not one block right under the header', () => {
    const previous = [header('chats', true), child('a'), header('work', false)];
    const next = [header('chats', false), child('c1'), header('work', false)];

    expect(findSessionSidebarDisclosure(previous, next)).toBeNull();
  });

  test('ignores rows that changed without a header changing', () => {
    const previous = [header('chats', false), child('c1')];
    const next = [header('chats', false), child('c1'), child('c2')];

    expect(findSessionSidebarDisclosure(previous, next)).toBeNull();
  });

  test('reveals and folds a Show more batch before its control', () => {
    const control = (requestedCount: number): SessionSidebarRow => ({ ...child('project:show'), requestedCount });
    const previous = [header('chats', false), sessionRow('s1'), control(7), header('work', false)];
    const next = [header('chats', false), sessionRow('s1'), sessionRow('s2', true), child('s2-child'), control(14), header('work', false)];
    const block = { previousHeaderIndex: 1, nextHeaderIndex: 1, blockStart: 2, blockEnd: 4 };

    expect(findSessionSidebarDisclosure(previous, next)).toEqual({ ...block, opened: true });
    expect(findSessionSidebarDisclosure(next, previous)).toEqual({ ...block, opened: false });
    expect(sessionSidebarDisclosureBounds({ ...block, opened: true },
      previous.map((_, i) => ({ start: i * 32, end: (i + 1) * 32 })),
      next.map((_, i) => ({ start: i * 32, end: (i + 1) * 32 })),
    )).toEqual({ from: 64, to: 128, shift: 0 });
  });

  test('does not animate arriving sessions when the requested page size stays the same', () => {
    const control = child('project:show');
    const previous = [header('chats', false), sessionRow('s1'), control];
    const next = [header('chats', false), sessionRow('s1'), sessionRow('s2'), { ...control, currentCount: 8 }];
    expect(findSessionSidebarDisclosure(previous, next)).toBeNull();
  });

  test('does not animate pagination mixed with a reorder', () => {
    const control = child('project:show');
    const previous = [header('chats', false), sessionRow('s1'), sessionRow('s2'), control];
    const next = [header('chats', false), sessionRow('s2'), sessionRow('s1'), sessionRow('s3'), { ...control, requestedCount: 14 }];
    expect(findSessionSidebarDisclosure(previous, next)).toBeNull();
  });
});
