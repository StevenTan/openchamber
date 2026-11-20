import React from 'react';
import { defaultRangeExtractor, measureElement, useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import type { SessionSidebarRow, SessionSidebarRowModel } from './sessionSidebarRowModel';
import { SessionTreeGuides } from './sessions/SessionTreeGuides';
import { SESSION_TREE_BASE_PADDING_PX } from './sessions/sessionTreeGeometry';
import {
  ROW_DISCLOSURE_EASING,
  ROW_DISCLOSURE_MS,
} from '@/lib/motion/rowDisclosure';
import {
  estimateSessionSidebarRowSize,
  findFirstVisibleSessionSidebarRowIndex,
  findSessionSidebarScrollAnchor,
  getInitialSessionSidebarRowIndexes,
  isSessionSidebarUserChange,
  mergeSessionSidebarVirtualIndexes,
  resolveSessionSidebarScrollAnchor,
  sectionSpacingAfter,
  sectionWrapperClass,
  sessionSidebarRowSizeKey,
  sessionSidebarRowVirtualKey,
} from './sessionSidebarVirtualization';

/** A removed occurrence stays visible while it fades out. */
type GhostRow = { row: SessionSidebarRow; nextRow: SessionSidebarRow | undefined; start: number; end: number; opacity: number };

type RowMotion = {
  id: number;
  positions: ReadonlyMap<string, { start: number; opacity: number }>;
  revealKeys: ReadonlySet<string>;
  ghosts: readonly GhostRow[];
  /** Previously mounted rows stay mounted until their move finishes. */
  slidingIndexes: readonly number[];
};

type RowPosition = { start: number; opacity: number };
type RowAnimation = { animation: Animation; from: RowPosition; to: RowPosition; fadeEnd: number };

/** The native animation keeps its progress after React removes its row. */
const animatedRowPosition = ({ animation, from, to, fadeEnd }: RowAnimation): RowPosition => {
  const progress = animation.effect?.getComputedTiming().progress ?? 1;
  return {
    start: from.start + (to.start - from.start) * progress,
    opacity: from.opacity + (to.opacity - from.opacity) * Math.min(progress / fadeEnd, 1),
  };
};

const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

type Props = {
  model: SessionSidebarRowModel;
  scrollElement: HTMLElement | null;
  pinnedRowIndexes: ReadonlySet<number>;
  renderRow: (row: SessionSidebarRow, index: number) => React.ReactNode;
  onFirstVisibleIndexChange: (index: number) => void;
  guideSlotStartPx?: number;
  scrollRequest?: { index: number; id: number } | null;
  projectDivider?: boolean;
  getStickyHeaderHeight?: (scrollElement: HTMLElement) => number;
  heldRowRef?: React.RefObject<SessionSidebarHeldRow | null>;
};

export type SessionSidebarHeldRow = { key: string; offset: number };

export function SessionSidebarRows({
  model,
  scrollElement,
  pinnedRowIndexes,
  renderRow,
  onFirstVisibleIndexChange,
  guideSlotStartPx = SESSION_TREE_BASE_PADDING_PX,
  scrollRequest = null,
  getStickyHeaderHeight,
  heldRowRef,
  projectDivider = true,
}: Props): React.ReactNode {
  const rows = model.rows;
  const heldRow = heldRowRef?.current;
  const getScrollElement = React.useCallback(() => scrollElement, [scrollElement]);
  const measuredHeightByKeyRef = React.useRef(new Map<string, number>());
  const measuredGapBySpacingRef = React.useRef(new Map<string, number>());
  const estimateSize = React.useCallback((index: number) => {
    const row = rows[index];
    if (!row) return 32;
    const nextRow = rows[index + 1];
    return estimateSessionSidebarRowSize(row, nextRow, {
      height: measuredHeightByKeyRef.current.get(sessionSidebarRowSizeKey(row)),
      gapBySpacing: measuredGapBySpacingRef.current,
    });
  }, [rows]);
  const measureRow = React.useCallback((
    element: HTMLDivElement,
    entry: ResizeObserverEntry | undefined,
    instance: Virtualizer<HTMLElement, HTMLDivElement>,
  ) => {
    const size = measureElement(element, entry, instance);
    const index = instance.indexFromElement(element);
    const row = rows[index];
    if (row) {
      const spacing = sectionSpacingAfter(row, rows[index + 1]);
      const gap = spacing ? Number.parseFloat(getComputedStyle(element).paddingBottom) || 0 : 0;
      if (spacing) measuredGapBySpacingRef.current.set(spacing, gap);
      measuredHeightByKeyRef.current.set(sessionSidebarRowSizeKey(row), size - gap);
    }
    return size;
  }, [rows]);
  const getItemKey = React.useCallback((index: number) => {
    const row = rows[index];
    return row ? sessionSidebarRowVirtualKey(row, rows[index + 1]) : index;
  }, [rows]);
  const motionIdRef = React.useRef(0);
  const [motion, setMotion] = React.useState<RowMotion | null>(null);
  const rowAnimationsRef = React.useRef(new Map<string, RowAnimation>());
  const slidingIndexes = motion?.slidingIndexes;
  const rangeExtractor = React.useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const indexes = defaultRangeExtractor(range);
    const pinned = slidingIndexes?.length ? new Set([...pinnedRowIndexes, ...slidingIndexes]) : pinnedRowIndexes;
    return mergeSessionSidebarVirtualIndexes(indexes, pinned, rows.length);
  }, [pinnedRowIndexes, rows.length, slidingIndexes]);

  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rows.length,
    enabled: scrollElement !== null,
    getScrollElement,
    estimateSize,
    measureElement: measureRow,
    getItemKey,
    overscan: 8,
    rangeExtractor,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = scrollElement ? virtualizer.getTotalSize() : 0;
  const maximumScrollOffset = scrollElement
    ? Math.max(totalSize - scrollElement.clientHeight, 0)
    : 0;
  const renderedScrollTop = scrollElement ? scrollElement.scrollTop : 0;
  const scrollOffset = Math.min(renderedScrollTop, maximumScrollOffset);
  const firstVisibleIndex = findFirstVisibleSessionSidebarRowIndex(virtualItems, scrollOffset);
  React.useLayoutEffect(() => {
    onFirstVisibleIndexChange(firstVisibleIndex);
  }, [firstVisibleIndex, onFirstVisibleIndexChange]);

  React.useEffect(() => {
    if (scrollRequest && scrollElement) virtualizer.scrollToIndex(scrollRequest.index, { align: 'center' });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest, scrollElement]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastLayoutRef = React.useRef<{
    model: SessionSidebarRowModel;
    items: readonly VirtualItem[];
    scrollTop: number;
  } | null>(null);

  // Rows that changed above what the user sees, with nothing the user did to
  // the list (see `isSessionSidebarUserChange`): sessions arriving, leaving or
  // moving, rows changing height with Detailed rows. The scroll position alone
  // stays, so the rows on screen slid away, or past the end of a list that got
  // shorter. Put the row at the top of what the user sees, under a pinned
  // header, back where it was.
  React.useLayoutEffect(() => {
    const last = lastLayoutRef.current;
    if (!last || last.model.rows === model.rows || !scrollElement || scrollElement.clientHeight === 0) return;
    const held = heldRowRef?.current;
    if (held && heldRowRef) {
      heldRowRef.current = null;
      const index = model.rowIndexByKey.get(held.key);
      virtualizer.getTotalSize();
      const start = index === undefined ? undefined : virtualizer.measurementsCache[index]?.start;
      if (start !== undefined) virtualizer.scrollToOffset(Math.max(start - held.offset, 0));
      return;
    }
    if (isSessionSidebarUserChange(last.model, model)) return;
    const inset = getStickyHeaderHeight?.(scrollElement) ?? 0;
    const line = renderedScrollTop + inset;
    const anchor = findSessionSidebarScrollAnchor(last.model.rows, last.items, line, renderedScrollTop + scrollElement.clientHeight, model.rowIndexByKey);
    if (!anchor) return;
    virtualizer.getTotalSize();
    const nextLine = resolveSessionSidebarScrollAnchor(anchor, model.rowIndexByKey, virtualizer.measurementsCache);
    if (nextLine !== null && Math.abs(nextLine - inset - scrollElement.scrollTop) > 0.5) virtualizer.scrollToOffset(Math.max(nextLine - inset, 0));
  }, [model, scrollElement, virtualizer, renderedScrollTop, getStickyHeaderHeight, heldRowRef]);

  // Every membership or order change uses the same keyed transition.
  // Resolve the scroll anchor first, then animate the mounted occurrences from
  // their previous viewport positions to the new virtual layout.
  React.useLayoutEffect(() => {
    const last = lastLayoutRef.current;
    const container = containerRef.current;
    if (!last || last.model.rows === rows || !scrollElement || !container) return;
    if (last.model.rows.length === rows.length && rows.every((row, index) => row.key === last.model.rows[index].key)) return;
    if (prefersReducedMotion() || scrollElement.clientHeight === 0 || container.closest('[inert]')
      || heldRow || last.model.search || model.search) {
      setMotion(null);
      return;
    }

    const after = virtualizer.measurementsCache;
    const positions = new Map<string, { start: number; opacity: number }>();
    const revealKeys = new Set<string>();
    const ghosts = new Map<string, GhostRow>();
    const slidingIndexes: number[] = [];
    const scrollShift = scrollElement.scrollTop - last.scrollTop;
    const anchorShift = scrollElement.scrollTop - renderedScrollTop;
    // An interrupted transition starts from the picture currently on screen.
    const position = (key: string, source: RowPosition) => {
      const active = rowAnimationsRef.current.get(key);
      if (!active) return { ...source, start: source.start + scrollShift };
      const current = animatedRowPosition(active);
      return { ...current, start: current.start + anchorShift };
    };
    // Presence includes rows still exiting, so returning keys keep their
    // presentation instead of starting a second entrance.
    const previousRows = new Map<string, GhostRow>();
    for (const item of last.items) {
      const row = last.model.rows[item.index];
      previousRows.set(row.key, { row, nextRow: last.model.rows[item.index + 1], start: item.start, end: item.end, opacity: 1 });
    }
    for (const ghost of motion?.ghosts ?? []) previousRows.set(ghost.row.key, ghost);
    let moved = false;
    for (const item of previousRows.values()) {
      const { row } = item;
      const nextIndex = model.rowIndexByKey.get(row.key);
      const previous = position(row.key, item);
      if (nextIndex !== undefined) {
        positions.set(row.key, previous);
        slidingIndexes.push(nextIndex);
        const next = after[nextIndex];
        if (next && (Math.abs(previous.start - next.start) > 0.5 || previous.opacity < 1)) moved = true;
      } else {
        ghosts.set(row.key, { ...item, ...previous, end: previous.start + item.end - item.start });
      }
    }
    for (const item of virtualizer.getVirtualItems()) {
      const row = rows[item.index];
      if (!last.model.rowIndexByKey.has(row.key) && !previousRows.has(row.key)) revealKeys.add(row.key);
    }
    if (!moved && !revealKeys.size && !ghosts.size) return;
    motionIdRef.current += 1;
    setMotion({ id: motionIdRef.current, positions, revealKeys, ghosts: [...ghosts.values()], slidingIndexes });
  }, [model, rows, scrollElement, virtualizer, renderedScrollTop, heldRow, motion]);

  // Recorded after the effects above read it, on every commit, so it always
  // holds the layout the user last saw.
  React.useLayoutEffect(() => {
    lastLayoutRef.current = { model, items: virtualItems, scrollTop: scrollElement?.scrollTop ?? 0 };
  });

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!motion || !container) return;
    const timing: KeyframeAnimationOptions = { duration: ROW_DISCLOSURE_MS, easing: ROW_DISCLOSURE_EASING };
    const animations: Animation[] = [];
    const rowAnimations = rowAnimationsRef.current;
    const ghosts = new Map(motion.ghosts.map((ghost) => [ghost.row.key, ghost]));
    for (const element of container.children) {
      if (!(element instanceof HTMLElement)) continue;
      const key = element.dataset.sidebarRowKey ?? '';
      const start = Number(element.dataset.sidebarVirtualStart);
      const ghost = ghosts.get(key);
      const from = ghost ? { start, opacity: ghost.opacity }
        : motion.revealKeys.has(key) ? { start: start - 6, opacity: 0 } : motion.positions.get(key);
      const to = { start, opacity: ghost ? 0 : 1 };
      if (!from || (Math.abs(from.start - to.start) <= 0.5 && from.opacity === to.opacity)) continue;
      const frame = (position: RowPosition): Keyframe => ({ transform: `translateY(${position.start}px)`, opacity: position.opacity });
      const fadeEnd = ghost ? 0.6 : 1;
      const frames = ghost ? [frame(from), { ...frame(to), offset: fadeEnd }, frame(to)] : [frame(from), frame(to)];
      const animation = element.animate(frames, { ...timing, fill: ghost ? 'forwards' : 'none' });
      animations.push(animation);
      rowAnimations.set(key, { animation, from, to, fadeEnd });
    }
    let cancelled = false;
    void Promise.all(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) setMotion((current) => (current?.id === motion.id ? null : current));
    }, () => undefined);
    return () => {
      cancelled = true;
      for (const animation of animations) animation.cancel();
      rowAnimations.clear();
    };
  }, [motion]);

  const renderRowWithGuides = (row: SessionSidebarRow, index: number): React.ReactNode => (row.treeGuides
    ? <div className="relative flow-root">
      {renderRow(row, index)}
      <SessionTreeGuides guides={row.treeGuides} slotStartPx={guideSlotStartPx} />
    </div>
    : renderRow(row, index));

  if (!scrollElement) {
    const indexes = getInitialSessionSidebarRowIndexes(rows.length);
    const renderedHeight = indexes.reduce((total, index) => total + (rows[index]?.estimateSize ?? 0), 0);
    const estimatedTotal = rows.reduce((total, row) => total + row.estimateSize, 0);
    return <div data-sidebar-virtual-pending="true">
      {indexes.map((index) => {
        const row = rows[index];
        return row ? <div key={row.key} className={sectionWrapperClass(row, rows[index + 1], projectDivider)}>{renderRowWithGuides(row, index)}</div> : null;
      })}
      {estimatedTotal > renderedHeight ? <div aria-hidden="true" style={{ height: estimatedTotal - renderedHeight }} /> : null}
    </div>;
  }

  const ghostsEnd = motion?.ghosts.reduce((end, ghost) => Math.max(end, ghost.end), 0) ?? 0;
  return <div ref={containerRef} data-sidebar-virtual-ready="true" style={{ height: Math.max(totalSize, ghostsEnd), position: 'relative' }}>
    {motion?.ghosts.filter((ghost) => !model.rowIndexByKey.has(ghost.row.key)).map((ghost) => <div
      key={`ghost:${ghost.row.key}`}
      aria-hidden="true"
      inert
      className={`[&_[data-session-row-box]]:my-px ${sectionWrapperClass(ghost.row, ghost.nextRow, projectDivider)}`}
      data-sidebar-ghost="true"
      data-sidebar-row-key={ghost.row.key}
      data-sidebar-virtual-start={ghost.start}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        pointerEvents: 'none',
        opacity: ghost.opacity,
        transform: `translateY(${ghost.start}px)`,
      }}
    >
      {renderRowWithGuides(ghost.row, -1)}
    </div>)}
    {virtualItems.map((item) => {
      const row = rows[item.index];
      if (!row) return null;
      return <div
        key={row.key}
        className={`[&_[data-session-row-box]]:my-px ${sectionWrapperClass(row, rows[item.index + 1], projectDivider)}`}
        data-index={item.index}
        data-sidebar-row-key={row.key}
        data-sidebar-virtual-start={item.start}
        ref={virtualizer.measureElement}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${item.start}px)`,
        }}
      >
        {renderRowWithGuides(row, item.index)}
      </div>;
    })}
  </div>;
}
