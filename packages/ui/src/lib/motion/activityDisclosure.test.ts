import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { animateActivityDisclosure } from './activityDisclosure';

test('activity updates immediately on unsupported runtimes and with reduced motion', async () => {
  const dom = new Window();
  const originals = new Map(['document', 'window', 'CSS'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let calls = 0;
  const update = () => { calls++; };
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
    const trigger = document.createElement('button');
    animateActivityDisclosure(trigger, update);
    expect(calls).toBe(1);
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: () => { throw new Error('Reduced motion must not capture snapshots'); } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: true }) } });
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports: () => true } });
    animateActivityDisclosure(trigger, update);
    expect(calls).toBe(2);
  } finally {
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('snapshot clips at the composer and replacing a transition preserves the current scope', async () => {
  const dom = new Window();
  const originals = new Map(['document', 'window', 'CSS'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const finished: Array<() => void> = [];
  let skipped = 0;
  let calls = 0;
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports: () => true } });
    document.body.innerHTML = '<div data-chat-column="main"><div class="chat-scroll"><button>Activity</button></div><div data-composer-slot="floating"></div></div><div class="chat-scroll" id="other"></div>';
    const viewport = document.querySelector<HTMLElement>('.chat-scroll')!;
    const composer = document.querySelector<HTMLElement>('[data-composer-slot]')!;
    viewport.getBoundingClientRect = () => new dom.DOMRect(100, 40, 600, 760);
    composer.getBoundingClientRect = () => new dom.DOMRect(0, 650, 1000, 150);
    Object.defineProperties(document.documentElement, { clientWidth: { value: 1000 }, clientHeight: { value: 900 } });
    // SAFETY: the animation only consumes ready, finished and skipTransition from this controlled transition double.
    document.startViewTransition = ((options: { update: () => void }) => {
      options.update();
      return {
        ready: Promise.resolve(),
        finished: new Promise<void>((resolve) => finished.push(resolve)),
        skipTransition: () => { skipped++; },
      };
    }) as typeof document.startViewTransition;
    const trigger = viewport.querySelector<HTMLElement>('button')!;
    animateActivityDisclosure(trigger, () => { calls++; });
    expect(document.documentElement.style.getPropertyValue('--oc-activity-clip')).toBe('inset(40px 300px 250px 100px)');
    expect(viewport.hasAttribute('data-activity-transition')).toBe(true);
    expect(document.getElementById('other')?.hasAttribute('data-activity-transition')).toBe(false);
    animateActivityDisclosure(trigger, () => { calls++; });
    finished[0]();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(skipped).toBe(1);
    expect(calls).toBe(2);
    expect(viewport.hasAttribute('data-activity-transition')).toBe(true);
    finished[1]();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(viewport.hasAttribute('data-activity-transition')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--oc-activity-clip')).toBe('');
  } finally {
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
