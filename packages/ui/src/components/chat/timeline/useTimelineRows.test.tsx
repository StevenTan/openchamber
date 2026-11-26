import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { createLiveTailStore } from './liveTailStore';
import { useTimelineRows } from './useTimelineRows';
import { buildLiveStreamingEntry } from '../lib/turns/streamingTailEntry';
import type { ChatMessageEntry } from '../lib/turns/types';

test('adds Activity when reasoning arrives only through live parts', async () => {
    const window = new Window();
    const globals = { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const root = createRoot(document.createElement('div'));
    const messages: ChatMessageEntry[] = [
        { info: { id: 'user', sessionID: 'native', role: 'user', time: { created: 1 } }, parts: [] },
        { info: { id: 'assistant', sessionID: 'native', role: 'assistant', time: { created: 2 }, agent: 'antigravity', providerID: 'antigravity', modelID: 'gemini' }, parts: [] },
    ];
    const liveTail = createLiveTailStore();
    const turnExpansion = new Map<string, boolean>();
    let timeline!: ReturnType<typeof useTimelineRows>;
    let renders = 0;
    const Harness = () => {
        renders++;
        timeline = useTimelineRows('native', messages, { showTurnChangedFiles: false, showReasoningTraces: true, stickyUserHeader: false, defaultActivityExpanded: false, turnExpansion, liveTail });
        return null;
    };
    try {
        await act(async () => root.render(<Harness />));
        expect(timeline.rows.map(row => row.kind)).toEqual(['turn-head', 'turn-message']);
        const entry = timeline.trailingStreamingEntry!;
        const publish = async (text: string) => act(async () => {
            liveTail.set(buildLiveStreamingEntry(entry, { showTurnChangedFiles: false, livePartsByMessageId: { assistant: [
                { id: 'reasoning', sessionID: 'native', messageID: 'assistant', type: 'reasoning', text, time: { start: 2 } },
            ] } }));
            liveTail.notify();
        });
        await publish('Thinking');
        expect(timeline.rows.map(row => row.kind)).toEqual(['turn-head', 'turn-fold']);
        const activityRenders = renders;
        await publish('Thinking more');
        expect(renders).toBe(activityRenders);
        turnExpansion.set('user', true);
        await act(async () => {
            liveTail.set(buildLiveStreamingEntry(entry, { showTurnChangedFiles: false, livePartsByMessageId: { assistant: [{
                id: 'page', type: 'tool', tool: 'openchamber_render', callID: 'page', sessionID: 'native', messageID: 'assistant',
                state: { status: 'completed', input: { action: 'render.page', html: '<p>Result</p>', title: 'Result' }, output: '{}', metadata: { openchamber: { ok: true } }, time: { start: 2, end: 3 } },
            }] } }));
            liveTail.notify();
        });
        expect(timeline.rows.map(row => row.kind)).toEqual(['turn-head', 'turn-fold', 'turn-message', 'turn-pages']);
    } finally {
        await act(async () => root.unmount());
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
        window.happyDOM.abort();
    }
});
