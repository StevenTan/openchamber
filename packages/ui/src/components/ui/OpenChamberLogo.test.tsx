import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '@/lib/i18n';
import { OpenChamberLogo } from './OpenChamberLogo';
import { LOGO_PANEL_REST } from './openChamberLogoArt';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  HTMLElement: browser.HTMLElement, getComputedStyle: browser.getComputedStyle.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

let root: Root;
let host: HTMLDivElement;

const render = (element: React.ReactElement) => act(async () => {
  root.render(<I18nProvider>{element}</I18nProvider>);
});
const advance = (ms: number) => act(async () => {
  jest.advanceTimersByTime(ms);
});
const opacity = () => Number(host.querySelector('img')!.style.opacity);

beforeEach(() => {
  jest.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  jest.useRealTimers();
});

test('a still logo preserves its caller opacity', async () => {
  await render(<OpenChamberLogo className="opacity-20" />);
  expect(host.querySelector('img')?.style.opacity).toBe('');
  expect(host.querySelector('img')?.className).toBe('opacity-20');
  expect(host.querySelector('img')?.alt).toBeTruthy();
  await advance(3000);
  expect(host.querySelector('img')?.style.opacity).toBe('');
});

test('a loading logo changes opacity on the shared one-second clock', async () => {
  await render(<OpenChamberLogo isAnimated />);
  const first = opacity();
  await advance(1000);
  expect(opacity()).toBe(first === 1 ? LOGO_PANEL_REST : 1);
  await advance(1000);
  expect(opacity()).toBe(first);
});
