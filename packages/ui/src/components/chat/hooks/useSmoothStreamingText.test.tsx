import { afterAll, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useSmoothStreamingText } from './useSmoothStreamingText';

const browser = new Window();
Object.assign(globalThis, { window: browser, document: browser.document });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
let now = 0;
const clock = spyOn(performance, 'now').mockImplementation(() => now);
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const originalRequest = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = (frame) => { frames.delete(frame); };
const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
let hidden = false;
Object.defineProperty(browser.document, 'hidden', { get: () => hidden });
const motion = browser.matchMedia('(prefers-reduced-motion: reduce)');
let reduced = false;
Object.defineProperty(motion, 'matches', { get: () => reduced });
browser.matchMedia = () => motion;

function Reply(props: { text: string; isStreaming: boolean; identityKey: string }) {
    return <p>{useSmoothStreamingText(props)}</p>;
}
const draw = async (text: string, isStreaming = true, identityKey = 'reply') => {
    await act(() => root.render(<Reply text={text} isStreaming={isStreaming} identityKey={identityKey} />));
};
const advance = async () => {
    // rAF timestamps and performance.now share the browser's monotonic clock.
    now += 40;
    const pending = [...frames.values()];
    frames.clear();
    await act(() => { for (const callback of pending) callback(now); });
};

afterAll(async () => {
    await act(() => root.unmount());
    browser.happyDOM.abort();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    clock.mockRestore();
});

test('streams unfinished text, flushes completion and leaves no scheduled frame', async () => {
    await draw('');
    await draw('A growing paragraph without a newline');
    expect(host.textContent).toBe('');
    await advance();
    expect(host.textContent!.length).toBeGreaterThan(0);
    expect(host.textContent!.length).toBeLessThan(36);
    await draw('A growing paragraph without a newline', false);
    expect(host.textContent).toBe('A growing paragraph without a newline');
    expect(frames.size).toBe(0);
});

test('identity switches and replacement text cannot display another source', async () => {
    await draw('Other conversation', true, 'other');
    expect(host.textContent).toBe('Other conversation');
    await draw('Replacement', true, 'other');
    expect(host.textContent).toBe('Replacement');
    await draw('Re', true, 'other');
    expect(host.textContent).toBe('Re');
});

test('hidden documents and reduced motion display the latest source without scheduling', async () => {
    await draw('Re with pending text', true, 'other');
    expect(frames.size).toBe(1);
    hidden = true;
    await act(() => browser.document.dispatchEvent(new browser.Event('visibilitychange')));
    expect(host.textContent).toBe('Re with pending text');
    expect(frames.size).toBe(0);
    hidden = false;
    reduced = true;
    await draw('Re with pending text and more', true, 'other');
    expect(host.textContent).toBe('Re with pending text and more');
    expect(frames.size).toBe(0);
    reduced = false;
});

test('unmount cancels pending work', async () => {
    await draw('Re with pending text and more appended', true, 'other');
    expect(frames.size).toBe(1);
    await act(() => root.render(null));
    expect(frames.size).toBe(0);
});

test('a caught-up reply stops scheduling even while the turn stays live', async () => {
    await draw('', true, 'caught-up');
    await draw('An unfinished line', true, 'caught-up');
    for (let frame = 0; frame < 10; frame += 1) await advance();
    expect(host.textContent).toBe('An unfinished line');
    expect(frames.size).toBe(0);
});
