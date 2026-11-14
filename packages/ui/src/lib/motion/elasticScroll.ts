import { cancelFrame, frame as motionFrame } from 'motion';
import { OverscrollAxis, WHEEL_MULTIPLIER } from './vendor/smooth-scrollbar/overscroll';
import type { NativeScrollAPI } from '@/lib/api/types';
import { NativeOverscrollAxis } from './NativeOverscrollAxis';

type ScrollAxis = OverscrollAxis | NativeOverscrollAxis;

/** Terminal scrollback supplies pixel input before quantizing it into rows. */
export class TerminalScrollEdgeEvent extends Event {
  constructor(
    readonly deltaY: number,
    readonly atEdge: boolean,
    readonly routeWheel: (event: WheelEvent) => void,
  ) {
    super('openchamber:terminal-scroll-edge', { bubbles: true, cancelable: true });
  }
}

/** Visual feedback only: moving the scrollport keeps its own scroll range unchanged. */
const frame = (offset: number): Keyframe => ({
  transform: `translateY(${offset}px)`,
  clipPath: `inset(${Math.max(0, -offset)}px 0 ${Math.max(0, offset)}px 0)`,
});

/** One delegated wheel binding for native scrollports and terminal scrollback. */
export function bindElasticScroll(doc: Document, nativeScroll?: NativeScrollAPI): () => void {
  const view = doc.defaultView;
  if (!view) return () => undefined;
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  let active: {
    target: HTMLElement;
    effect: KeyframeEffect;
    animation: Animation;
    axis: ScrollAxis;
    bounds: DOMRect;
    routeWheel?: (event: WheelEvent) => void;
    generation: number;
  } | null = null;
  let axes = new WeakMap<HTMLElement, ScrollAxis>();
  let dragging = false;

  const stopMotion = () => {
    cancelFrame(render);
    if (active?.axis instanceof NativeOverscrollAxis) axes.delete(active.target);
    active?.animation.cancel();
    active = null;
  };
  const reset = () => {
    stopMotion();
    axes = new WeakMap();
  };
  const render = () => {
    if (!active) return;
    const value = active.axis.advance(view.performance.now());
    active.effect.setKeyframes([frame(value), frame(value)]);
    if (!active.axis.moving) stopMotion();
  };
  const pull = (target: HTMLElement, delta: number, routeWheel?: (event: WheelEvent) => void) => {
    if (reduced.matches) return;
    if (nativeScroll && !dragging) return true;
    // Preserve masks supplied by specialized viewers.
    if (active?.target !== target && view.getComputedStyle(target).clipPath !== 'none') return false;
    const now = view.performance.now();
    let axis = axes.get(target);
    if (!axis) {
      axis = nativeScroll ? new NativeOverscrollAxis() : new OverscrollAxis();
      axes.set(target, axis);
    }
    axis.input(-delta, now);
    if (!axis.moving) {
      if (active?.target === target) stopMotion();
      return true;
    }
    if (active?.target !== target) {
      stopMotion();
      const effect = new KeyframeEffect(target, [frame(0), frame(0)], { duration: 1, fill: 'both', composite: 'add' });
      const animation = new Animation(effect, doc.timeline);
      animation.pause();
      animation.currentTime = 0;
      active = {
        target, effect, animation, axis,
        bounds: target.getBoundingClientRect(), routeWheel, generation: 0,
      };
      motionFrame.update(render, true);
    }
    const state = active;
    state.generation += 1;
    return true;
  };
  const unsubscribe = nativeScroll?.subscribe(({ phase, momentumPhase }) => {
    // NSEventPhase: began=1, stationary=2, changed=4, ended=8,
    // cancelled=16, mayBegin=32. Momentum never extends a held pull.
    dragging = momentumPhase === 0 && (phase & (1 | 2 | 4 | 32)) !== 0 && (phase & (8 | 16)) === 0;
    if (!dragging && active?.axis instanceof NativeOverscrollAxis) {
      active.axis.release(view.performance.now());
    }
  });
  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey
      || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    let target: HTMLElement | undefined;
    let retargeted = false;
    for (const entry of event.composedPath()) {
      if (!(entry instanceof HTMLElement) || entry === doc.documentElement || entry === doc.body) continue;
      if (entry.scrollHeight <= entry.clientHeight + 1) continue;
      if (!/^(auto|scroll)$/.test(view.getComputedStyle(entry).overflowY)) continue;
      target = entry;
      break;
    }
    // The pulled viewport leaves a gap under the pointer. Keep that gesture
    // with its viewport instead of alternating between it and the parent.
    if (active && event.target instanceof Node && event.target.contains(active.target)) {
      const { left, right, top, bottom } = active.bounds;
      if (event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom) {
        target = active.target;
        retargeted = event.target !== target;
      }
    }
    if (!target) { reset(); return; }
    const routeWheel = active?.routeWheel;
    if (retargeted && active && routeWheel) {
      const held = active;
      const generation = held.generation;
      routeWheel(event);
      if (active === held && held.generation === generation) reset();
      return;
    }
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1);
    const atEdge = event.deltaY < 0 ? target.scrollTop <= 0
      : target.scrollTop >= target.scrollHeight - target.clientHeight - 1;
    const unwinding = nativeScroll && dragging && active?.target === target;
    if (!atEdge && !unwinding) {
      reset();
      event.preventDefault();
      if (event.defaultPrevented) target.scrollBy({ top: delta * WHEEL_MULTIPLIER, behavior: 'instant' });
      return;
    }
    if (pull(target, delta)) event.preventDefault();
  };
  const onTerminalEdge = (event: Event) => {
    if (event instanceof TerminalScrollEdgeEvent && event.target instanceof HTMLElement) {
      const unwinding = nativeScroll && dragging && event.target === active?.target;
      if (!event.atEdge && !unwinding) {
        if (event.target === active?.target) reset();
      } else {
        if (pull(event.target, event.deltaY, event.routeWheel)) event.preventDefault();
      }
    }
  };
  const onScroll = (event: Event) => { if (event.target === active?.target) reset(); };
  doc.addEventListener('wheel', onWheel, { passive: false });
  doc.addEventListener('openchamber:terminal-scroll-edge', onTerminalEdge);
  doc.addEventListener('scroll', onScroll, true);
  doc.addEventListener('pointerdown', reset, true);
  doc.addEventListener('keydown', reset, true);
  doc.addEventListener('visibilitychange', reset);
  view.addEventListener('blur', reset);
  view.addEventListener('resize', reset);
  reduced.addEventListener('change', reset);
  return () => {
    reset();
    doc.removeEventListener('wheel', onWheel);
    doc.removeEventListener('openchamber:terminal-scroll-edge', onTerminalEdge);
    doc.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('pointerdown', reset, true);
    doc.removeEventListener('keydown', reset, true);
    doc.removeEventListener('visibilitychange', reset);
    view.removeEventListener('blur', reset);
    view.removeEventListener('resize', reset);
    reduced.removeEventListener('change', reset);
    unsubscribe?.();
  };
}
