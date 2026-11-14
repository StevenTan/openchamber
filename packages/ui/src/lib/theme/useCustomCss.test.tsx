import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { useCustomCss, CUSTOM_CSS_STYLE_ID } from './useCustomCss';
import { CSSVariableGenerator } from './cssGenerator';
import { getDefaultTheme } from './themes';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useUIStore } from '@/stores/useUIStore';

test('custom CSS follows file events and device preference, and rejects obsolete runtime reads', async () => {
  const dom = new Window({ url: 'http://css.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const pending: Array<(response: Response) => void> = [];
  class Source {
    static CLOSED = 2;
    static instances: Source[] = [];
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { Source.instances.push(this); }
    close() { this.readyState = Source.CLOSED; }
  }
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event,
    CustomEvent: dom.CustomEvent, EventSource: Source, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.endsWith('/api/config/custom-css')
        ? new Promise<Response>((resolve) => pending.push(resolve))
        : Promise.resolve(Response.json({}));
    },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.createElement('div'));
  const previousEnabled = useUIStore.getState().customCssEnabled;
  const css = () => document.getElementById(CUSTOM_CSS_STYLE_ID)?.textContent ?? null;
  const resolve = async (response: Response) => {
    const complete = pending.shift();
    if (!complete) throw new Error('Expected a pending CSS read');
    await act(async () => complete(response));
  };
  const change = async (type = 'custom-css-changed') => act(async () => {
    Source.instances.at(-1)?.onmessage?.({ data: JSON.stringify({ type: `openchamber:${type}`, properties: {} }) });
  });
  function Probe() { useCustomCss(); return null; }
  try {
    useUIStore.setState({ customCssEnabled: true });
    switchRuntimeEndpoint({ apiBaseUrl: 'http://css.test', runtimeKey: 'css-one' });
    const generator = new CSSVariableGenerator();
    generator.apply(getDefaultTheme(false));
    await act(async () => root.render(<Probe />));
    await resolve(Response.json({ css: ':root { --custom-test: red }' }));
    expect(css()).toContain('red');
    generator.apply(getDefaultTheme(true));
    expect(document.getElementById('opencode-theme-variables')?.nextElementSibling?.id).toBe(CUSTOM_CSS_STYLE_ID);
    await change();
    await resolve(new Response('', { status: 500 }));
    expect(css()).toContain('red');
    await change();
    await resolve(Response.json({ css: '</style><script>literal</script>' }));
    expect(document.querySelector('script')).toBeNull();
    expect(css()).toContain('literal');
    await change();
    await resolve(Response.json({ css: '' }));
    expect(css()).toBeNull();
    await change('event-stream-ready');
    await resolve(Response.json({ css: 'body { color: blue }' }));
    expect(css()).toContain('blue');
    await change(); // a delayed reply from one, followed by one → two → one
    await act(async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'http://two.test', runtimeKey: 'css-two' });
      expect(css()).toBeNull();
      switchRuntimeEndpoint({ apiBaseUrl: 'http://css.test', runtimeKey: 'css-one' });
    });
    await resolve(Response.json({ css: 'obsolete one' }));
    await resolve(Response.json({ css: 'obsolete two' }));
    expect(css()).toBeNull();
    await resolve(Response.json({ css: 'current one' }));
    expect(css()).toBe('current one');
    await change();
    await change();
    await resolve(Response.json({ css: 'obsolete same-instance reply' }));
    expect(css()).toBe('current one');
    await resolve(Response.json({ css: 'latest same-instance reply' }));
    expect(css()).toBe('latest same-instance reply');
    await change();
    await act(async () => useUIStore.getState().setCustomCssEnabled(false));
    expect(css()).toBeNull();
    await resolve(Response.json({ css: 'late disabled reply' }));
    expect(css()).toBeNull();
    await act(async () => useUIStore.getState().setCustomCssEnabled(true));
    await resolve(Response.json({ css: 'enabled again' }));
    expect(css()).toBe('enabled again');
    await act(async () => root.unmount());
    expect(css()).toBeNull();
    dom.location.href = 'http://css.test/?custom-css=off';
    const recovery = createRoot(document.createElement('div'));
    await act(async () => recovery.render(<Probe />));
    expect(pending).toHaveLength(0);
    expect(css()).toBeNull();
    await act(async () => recovery.unmount());
    dom.location.href = 'http://css.test/';
    Object.assign(window, { __VSCODE_CONFIG__: { workspaceFolder: '/repo', workspaceFolders: [] } });
    const vscode = createRoot(document.createElement('div'));
    await act(async () => vscode.render(<Probe />));
    expect(pending).toHaveLength(0);
    await act(async () => vscode.unmount());
  } finally {
    await act(async () => root.unmount());
    useUIStore.setState({ customCssEnabled: previousEnabled });
    switchRuntimeEndpoint({ apiBaseUrl: '', runtimeKey: '' });
    dom.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
