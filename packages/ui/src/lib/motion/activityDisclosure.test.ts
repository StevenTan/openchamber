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
    document.body.innerHTML = '<div class="chat-scroll"><button>Activity</button></div>';
    const viewport = document.querySelector<HTMLElement>('.chat-scroll')!;
    const trigger = viewport.querySelector<HTMLElement>('button')!;
    animateActivityDisclosure(trigger, update);
    expect(calls).toBe(1);
    Object.defineProperty(viewport, 'startViewTransition', { configurable: true, value: () => { throw new Error('Reduced motion must not capture snapshots'); } });
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

test('activity snapshots belong to the clicked chat viewport', async () => {
  const dom = new Window();
  const originals = new Map(['document', 'window', 'CSS'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const scopes: HTMLElement[] = [];
  let calls = 0;
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports: () => true } });
    document.body.innerHTML = '<div class="chat-scroll"><button>Activity</button></div><div class="chat-scroll"><button>Activity</button></div>';
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: () => { throw new Error('Activity must stay inside its viewport'); } });
    const viewports = Array.from(document.querySelectorAll<HTMLElement>('.chat-scroll'));
    for (const viewport of viewports) {
      Object.defineProperty(viewport, 'startViewTransition', { configurable: true, value: (options: { update: () => void; types: string[] }) => {
        scopes.push(viewport);
        expect(options.types).toEqual(['oc-activity-disclosure']);
        options.update();
        return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
      } });
    }
    for (const viewport of [viewports[0], viewports[1], viewports[0]]) {
      animateActivityDisclosure(viewport.querySelector<HTMLElement>('button')!, () => { calls++; });
    }
    expect(scopes).toEqual([viewports[0], viewports[1], viewports[0]]);
    expect(calls).toBe(3);
  } finally {
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('detached snapshot shells are empty and released after a skipped update completes', async () => {
  const dom = new Window();
  const originals = new Map(['document', 'window', 'CSS'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let runUpdate = () => {};
  let completeUpdate = () => {};
  let rejectSnapshot = (_error: Error) => {};
  const ready = new Promise<void>((_resolve, reject) => { rejectSnapshot = reject; });
  const updateCallbackDone = new Promise<void>((resolve) => { completeUpdate = resolve; });
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false }) } });
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports: () => true } });
    document.body.innerHTML = '<div class="chat-scroll"><button>Activity</button><div id="step" data-turn-row="turn"><iframe></iframe><div id="nested" data-turn-row="turn">Tool output</div></div></div>';
    const viewport = document.querySelector<HTMLElement>('.chat-scroll')!;
    const step = document.getElementById('step')!;
    const nested = document.getElementById('nested')!;
    Object.defineProperty(viewport, 'startViewTransition', { value: (options: { update: () => void }) => {
      runUpdate = options.update;
      return { ready, updateCallbackDone };
    } });
    animateActivityDisclosure(viewport.querySelector<HTMLElement>('button')!, () => { step.remove(); });
    rejectSnapshot(new Error('Transition skipped'));
    await Promise.resolve();
    runUpdate();
    for (const element of [step, nested]) {
      expect(element.parentElement).toBe(viewport);
      expect(element.childNodes.length).toBe(0);
      expect(element.id).toBe('');
      expect(element.hasAttribute('data-turn-row')).toBe(false);
      expect(element.inert).toBe(true);
      expect(element.style.width).toBe('0px');
      expect(element.style.height).toBe('0px');
    }
    expect(viewport.querySelector('iframe')).toBeNull();
    completeUpdate();
    await Promise.allSettled([ready, updateCallbackDone]);
    await Promise.resolve();
    expect(step.isConnected).toBe(false);
    expect(nested.isConnected).toBe(false);
  } finally {
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
