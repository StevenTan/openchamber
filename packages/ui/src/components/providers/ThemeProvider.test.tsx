import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { ThemeProvider } from './ThemeProvider';
import { useUIStore } from '@/stores/useUIStore';

test('window zoom includes editor and terminal focus while preserving font preferences', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node,
    Event: dom.Event, CustomEvent: dom.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const originalState = useUIStore.getState();
  const applied: number[] = [];
  const nativeZoom = { set: async (percent: number) => { applied.push(percent); } };
  useUIStore.setState({ appZoom: 100, interfaceFontSizePx: 15.5, chatFontSizePx: 17, terminalFontSize: 14, editorFontSize: 13 });
  const zoom = (action: string) => window.dispatchEvent(new CustomEvent('openchamber:zoom', { detail: action }));
  try {
    await act(async () => root.render(<ThemeProvider zoom={nativeZoom}><input aria-label="composer" /></ThemeProvider>));
    await act(async () => { zoom('zoom-in'); zoom('zoom-in'); });
    expect(useUIStore.getState().appZoom).toBe(120);
    expect(applied.at(-1)).toBe(120);
    expect(document.documentElement.style.fontSize).toBe('');
    expect(document.documentElement.style.getPropertyValue('--text-ui-label')).toBe('15.5px');

    const terminal = document.createElement('input');
    terminal.dataset.terminalOwner = 'test-terminal';
    container.append(terminal);
    terminal.focus();
    await act(async () => zoom('zoom-in'));
    expect(useUIStore.getState().terminalFontSize).toBe(14);
    expect(useUIStore.getState().appZoom).toBe(130);
    await act(async () => zoom('zoom-reset'));
    expect(useUIStore.getState().terminalFontSize).toBe(14);
    expect(useUIStore.getState().appZoom).toBe(100);

    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const editorInput = document.createElement('textarea');
    editor.append(editorInput);
    container.append(editor);
    editorInput.focus();
    await act(async () => zoom('zoom-out'));
    expect(useUIStore.getState().editorFontSize).toBe(13);
    expect(useUIStore.getState().appZoom).toBe(90);

    const browser = document.createElement('webview');
    browser.tabIndex = 0;
    container.append(browser);
    browser.focus();
    expect(document.activeElement).toBe(browser);
    await act(async () => zoom('zoom-in'));
    expect(useUIStore.getState().appZoom).toBe(90);

    browser.blur();
    await act(async () => zoom('zoom-reset'));
    expect(useUIStore.getState().appZoom).toBe(100);
    expect(document.documentElement.style.fontSize).toBe('');
    const composer = document.createElement('div');
    composer.dataset.chatInput = 'true';
    composer.className = 'cm-editor';
    const composerInput = document.createElement('textarea');
    composer.append(composerInput);
    container.append(composer);
    composerInput.focus();
    await act(async () => zoom('zoom-in'));
    expect(useUIStore.getState().appZoom).toBe(110);
    expect(useUIStore.getState().editorFontSize).toBe(13);
    expect(useUIStore.getState().chatFontSizePx).toBe(17);
    await act(async () => zoom('zoom-reset'));
    await act(async () => root.unmount());
    zoom('zoom-in');
    expect(useUIStore.getState().appZoom).toBe(100);
  } finally {
    await act(async () => root.unmount());
    useUIStore.setState(originalState, true);
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
