import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useShownSessionSelection } from './useShownSessionSelection';

type Selection = { sessionId: string | null; directory: string | null };

const globals = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();
let root: Root;

beforeEach(() => {
  const dom = new Window({ url: 'http://selection.test' });
  const values = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
  for (const name of globals) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: values[name] });
  }
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  for (const name of globals) {
    const original = originals.get(name);
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const renderShown = (steps: Selection[]): Selection[] => {
  const rendered: Selection[] = [];
  const Probe = ({ target }: { target: Selection }) => {
    const { sessionId, directory } = useShownSessionSelection(target).selection;
    rendered.push({ sessionId, directory });
    return null;
  };
  for (const target of steps) {
    act(() => root.render(<Probe target={target} />));
  }
  return rendered;
};

const renderSelections = (steps: Selection[]): Array<string | null> =>
  renderShown(steps).map((selection) => selection.sessionId);

test('a session arriving from nothing renders at once', () => {
  const rendered = renderSelections([
    { sessionId: null, directory: null },
    { sessionId: 'ses_new', directory: '/repo' },
  ]);

  // The submitted draft's session replaces the empty selection in the same
  // commit; a lagging null here unmounted the whole chat column.
  expect(rendered.slice(1).every((sessionId) => sessionId === 'ses_new')).toBe(true);
});

test('switching between sessions still shows the previous one first', () => {
  const rendered = renderSelections([
    { sessionId: 'ses_a', directory: '/repo' },
    { sessionId: 'ses_b', directory: '/repo' },
  ]);

  expect(rendered).toEqual(['ses_a', 'ses_a', 'ses_b']);
});

test('a session moved to another directory renders there at once', () => {
  const rendered = renderShown([
    { sessionId: 'ses_a', directory: '/repo/worktree' },
    { sessionId: 'ses_a', directory: '/repo' },
  ]);

  // The move already emptied the old directory's store; a commit still naming
  // it had the chat read the session back into the directory it left.
  expect(rendered.slice(1).every((shown) => shown.sessionId === 'ses_a' && shown.directory === '/repo')).toBe(true);
});

test('loading keeps the complete displayed workspace until its target is renderable', () => {
    type Workspace = Selection & { owner: string; draft: string };
    const a: Workspace = { sessionId: 'ses_a', directory: '/a', owner: 'owner-a', draft: 'draft-a' };
    const b: Workspace = { sessionId: 'ses_b', directory: '/b', owner: 'owner-b', draft: 'draft-b' };
    const rendered: Array<{ selection: Workspace; revealWaited: boolean }> = [];
    const Probe = ({ target, ready }: { target: Workspace; ready: boolean }) => {
        rendered.push(useShownSessionSelection(target, { renderable: ready }));
        return null;
    };
    act(() => root.render(<Probe target={a} ready />));
    act(() => root.render(<Probe target={b} ready={false} />));
    expect(rendered.every(({ selection }) => selection === a)).toBe(true);
    act(() => root.render(<Probe target={b} ready />));
    expect(rendered.at(-1)).toEqual({ selection: b, revealWaited: true });
    expect(rendered.every(({ selection }) => selection === a || selection === b)).toBe(true);
});

test('a ready selection supersedes a pending session without displaying its workspace', () => {
    const rendered: Selection[] = [];
    const Probe = ({ target, ready }: { target: Selection; ready: boolean }) => {
        rendered.push(useShownSessionSelection(target, { renderable: ready }).selection);
        return null;
    };
    const a = { sessionId: 'ses_a', directory: '/a' };
    const b = { sessionId: 'ses_b', directory: '/b' };
    const c = { sessionId: 'ses_c', directory: '/c' };
    act(() => root.render(<Probe target={a} ready />));
    act(() => root.render(<Probe target={b} ready={false} />));
    act(() => root.render(<Probe target={c} ready />));
    expect(rendered).not.toContain(b);
    expect(rendered.at(-1)).toBe(c);
});
