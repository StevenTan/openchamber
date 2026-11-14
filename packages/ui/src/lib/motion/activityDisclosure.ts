import { flushSync } from 'react-dom';

let active: { transition: ViewTransition; cleanup: () => void } | null = null;

/** Animate snapshots of virtual rows; their layout and scroll measurements settle once. */
export function animateActivityDisclosure(trigger: HTMLElement, update: () => void): void {
  if (typeof document === 'undefined' || !document.startViewTransition
    || !CSS.supports('view-transition-name', 'match-element')
    || !CSS.supports('selector(:active-view-transition-type(oc-activity-disclosure))')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  const viewport = trigger.closest<HTMLElement>('.chat-scroll');
  if (!viewport) {
    update();
    return;
  }
  active?.transition.skipTransition();
  active?.cleanup();
  const root = document.documentElement;
  const rect = viewport.getBoundingClientRect();
  const composer = viewport.closest('[data-chat-column]')?.querySelector('[data-composer-slot]');
  const bottom = Math.min(rect.bottom, composer?.getBoundingClientRect().top ?? rect.bottom);
  // Snapshot pseudo-elements live in the top layer and lose ancestor overflow clipping.
  root.style.setProperty('--oc-activity-clip', `inset(${Math.max(0, rect.top)}px ${Math.max(0, root.clientWidth - rect.right)}px ${Math.max(0, root.clientHeight - bottom)}px ${Math.max(0, rect.left)}px)`);
  viewport.setAttribute('data-activity-transition', '');
  const cleanup = () => {
    viewport.removeAttribute('data-activity-transition');
    root.style.removeProperty('--oc-activity-clip');
  };
  const transition = document.startViewTransition({
    types: ['oc-activity-disclosure'],
    update: () => flushSync(update),
  });
  active = { transition, cleanup };
  // Skipping a replaced transition rejects ready; the state update still runs.
  void transition.ready.catch(() => undefined);
  void transition.finished.catch(() => undefined).finally(() => {
    if (active?.transition === transition) {
      cleanup();
      active = null;
    }
  });
}
