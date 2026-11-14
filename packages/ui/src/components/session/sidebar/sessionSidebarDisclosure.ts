import type { SessionSidebarRow } from './sessionSidebarRowModel';

/**
 * Opening and closing a section, project, worktree, folder, multi-run,
 * a session's subsessions, or another page of sessions in the
 * sidebar. The rows are a flat virtual list, so there is no container to
 * animate: the rows the header shows or hides are revealed above a moving
 * boundary, and the rows after them slide with that boundary, as one block
 * changing height would.
 */

/** A header's open state or a list's requested page size; null for other rows. */
const disclosureState = (row: SessionSidebarRow): boolean | number | null => {
  switch (row.kind) {
    case 'activity-header':
    case 'caption':
    case 'project-header':
    case 'group-header':
    case 'folder-header':
      return !row.collapsed;
    case 'run':
      return row.expanded;
    case 'session':
      return row.expanded ?? null;
    case 'show-control':
      return row.requestedCount;
    default:
      return null;
  }
};

type SessionSidebarDisclosure = {
  opened: boolean;
  /** The stable row before the block, in the previous and next lists. */
  previousHeaderIndex: number;
  nextHeaderIndex: number;
  /**
   * The rows shown or hidden, `[blockStart, blockEnd)`: indexes into the next
   * rows when the block opened, into the previous rows when it closed.
   */
  blockStart: number;
  blockEnd: number;
};

/** The list tail is the boundary when the disclosed block has no following row. */
export const sessionSidebarDisclosureBounds = (
  disclosure: SessionSidebarDisclosure,
  before: readonly { start: number; end: number }[],
  after: readonly { start: number; end: number }[],
): { from: number; to: number; shift: number } | null => {
  const headerBefore = before[disclosure.previousHeaderIndex];
  const headerAfter = after[disclosure.nextHeaderIndex];
  if (!headerBefore || !headerAfter) return null;
  const shift = headerAfter.start - headerBefore.start;
  const followingBefore = before[disclosure.opened ? disclosure.previousHeaderIndex + 1 : disclosure.blockEnd];
  const followingAfter = after[disclosure.opened ? disclosure.blockEnd : disclosure.nextHeaderIndex + 1];
  return {
    from: (followingBefore?.start ?? before[before.length - 1].end) + shift,
    to: followingAfter?.start ?? after[after.length - 1].end,
    shift,
  };
};

/**
 * The one disclosure or page size the user changed between two row lists, with
 * the rows that appeared or went under it. Null when no control changed, when
 * several did at once (Collapse all, search), or when the change is not one
 * block of rows right under the header.
 */
export const findSessionSidebarDisclosure = (
  previous: readonly SessionSidebarRow[],
  next: readonly SessionSidebarRow[],
): SessionSidebarDisclosure | null => {
  if (previous === next) return null;
  const previousIndexByKey = new Map(previous.map((row, index) => [row.key, index]));
  let toggled: { previousIndex: number; nextIndex: number; opened: boolean; pagination: boolean } | null = null;
  for (let nextIndex = 0; nextIndex < next.length; nextIndex += 1) {
    const open = disclosureState(next[nextIndex]);
    if (open === null) continue;
    const previousIndex = previousIndexByKey.get(next[nextIndex].key);
    if (previousIndex === undefined) continue;
    const wasOpen = disclosureState(previous[previousIndex]);
    if (wasOpen === null || wasOpen === open) continue;
    if (toggled) return null;
    const row = next[nextIndex];
    const previousRow = previous[previousIndex];
    const pagination = row.kind === 'show-control' && previousRow.kind === 'show-control';
    toggled = { previousIndex, nextIndex, opened: pagination ? row.requestedCount > previousRow.requestedCount : open === true, pagination };
  }
  if (!toggled) return null;

  if (toggled.pagination) {
    const [withBlock, withoutBlock] = toggled.opened ? [next, previous] : [previous, next];
    const added = withBlock.length - withoutBlock.length;
    if (added <= 0) return null;
    let blockStart = 0;
    while (blockStart < withoutBlock.length && withBlock[blockStart].key === withoutBlock[blockStart].key) blockStart += 1;
    if (blockStart === 0) return null;
    // Pagination reveals one batch before its control; unrelated row changes do not animate.
    for (let index = blockStart; index < withoutBlock.length; index += 1) {
      if (withoutBlock[index].key !== withBlock[index + added].key) return null;
    }
    return {
      opened: toggled.opened,
      previousHeaderIndex: blockStart - 1,
      nextHeaderIndex: blockStart - 1,
      blockStart,
      blockEnd: blockStart + added,
    };
  }

  const [withBlock, withoutBlock, headerWith, headerWithout] = toggled.opened
    ? [next, previous, toggled.nextIndex, toggled.previousIndex]
    : [previous, next, toggled.previousIndex, toggled.nextIndex];
  const followingKey = withoutBlock[headerWithout + 1]?.key ?? null;
  const blockStart = headerWith + 1;
  let blockEnd = blockStart;
  while (blockEnd < withBlock.length && withBlock[blockEnd].key !== followingKey) blockEnd += 1;
  if (followingKey !== null && blockEnd === withBlock.length) return null;
  if (blockEnd === blockStart) return null;
  return {
    opened: toggled.opened,
    previousHeaderIndex: toggled.previousIndex,
    nextHeaderIndex: toggled.nextIndex,
    blockStart,
    blockEnd,
  };
};
