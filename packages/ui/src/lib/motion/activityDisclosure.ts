import { flushSync } from 'react-dom';

type ActivityViewport = HTMLElement & { startViewTransition?: Document['startViewTransition'] };

/** Animate snapshots of virtual rows; their layout and scroll measurements settle once. */
export function animateActivityDisclosure(trigger: HTMLElement, update: () => void): void {
  const viewport = trigger.closest<ActivityViewport>('.chat-scroll');
  if (!viewport || typeof viewport.startViewTransition !== 'function'
    || !CSS.supports('view-transition-name', 'match-element')
    || !CSS.supports('selector(:active-view-transition-type(oc-activity-disclosure))')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  const retired: HTMLElement[] = [];
  const transition = viewport.startViewTransition({
    types: ['oc-activity-disclosure'],
    update: () => {
      const previous = Array.from(viewport.querySelectorAll<HTMLElement>('[data-turn-row], [data-turn-id], [data-live-activity-content] ~ *'));
      flushSync(update);
      const removed = previous.filter((element) => !element.isConnected);
      // Chromium prepaint needs outgoing element identities until capture is ready.
      // Empty shells keep that identity without reconnecting tool frames or scroll targets.
      for (const element of removed) {
        element.replaceChildren();
        for (const name of element.getAttributeNames()) element.removeAttribute(name);
        element.inert = true;
        element.style.cssText = 'position:absolute;inset:0;width:0;height:0;opacity:0;overflow:hidden;view-transition-name:none;';
        viewport.appendChild(element);
      }
      retired.push(...removed);
    },
  });
  // A skipped transition can reject ready before its update callback runs.
  void Promise.allSettled([transition.ready, transition.updateCallbackDone]).then(() => {
    for (const element of retired) element.remove();
  });
}
