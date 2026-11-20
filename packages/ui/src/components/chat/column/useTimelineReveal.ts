import React from 'react';
import type { TimelineRevealGate } from '../timelineRevealGate';

const TIMELINE_SETTLE_STABLE_FRAMES = 2;
const TIMELINE_SETTLE_CAP_MS = 300;
const TIMELINE_REVEAL_FADE_MS = 100;

export const useTimelineReveal = ({
    timelineRootRef,
    scrollRef,
    revealGate,
    showingTranscript,
    endPinningReleased,
    currentSessionId,
    currentSessionKey,
    revealWaited,
    retainedTimelineCount,
}: {
    timelineRootRef: React.RefObject<HTMLDivElement | null>;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    revealGate: TimelineRevealGate;
    showingTranscript: boolean;
    endPinningReleased: boolean;
    currentSessionId: string;
    currentSessionKey: string;
    revealWaited: boolean;
    retainedTimelineCount: number;
}): void => {
    const endPinningReleasedRef = React.useRef(endPinningReleased);
    endPinningReleasedRef.current = endPinningReleased;
    // Read through a ref: the effect runs once per gate (per opened session).
    // `revealWaited` flips for the session still on screen the moment another
    // one is selected — before the deferred swap mounts it — and re-running
    // the effect then would hide the outgoing timeline for the frames until
    // the new one arrives.
    const revealWaitedRef = React.useRef(revealWaited);
    revealWaitedRef.current = revealWaited;
    const retainedRevealsRef = React.useRef<Array<{ sessionId: string; sessionKey: string; ready: boolean }>>([]);
    React.useLayoutEffect(() => {
        const root = timelineRootRef.current;
        if (!root || !showingTranscript) return;
        // Match the message-list pool's membership, including an opening
        // session whose first paint has not finished yet.
        const cached = retainedRevealsRef.current.find((entry) => entry.sessionId === currentSessionId);
        const entry = cached?.sessionKey === currentSessionKey ? cached : { sessionId: currentSessionId, sessionKey: currentSessionKey, ready: false };
        retainedRevealsRef.current = [entry, ...retainedRevealsRef.current.filter((item) => item.sessionId !== currentSessionId)].slice(0, retainedTimelineCount);
        if (entry.ready) {
            revealGate.close();
            root.removeAttribute('data-timeline-reveal');
            return;
        }
        root.setAttribute('data-timeline-reveal', 'pending');
        let finished = false;
        let timer: number | null = null;
        let frame: number | null = null;
        let fadeTimer: number | null = null;
        // Revealed once the geometry has settled: after the last hold the
        // list still lays rows out from its own measurements over a few
        // frames, so the timeline stays hidden — pinned to the end on every
        // frame — until the content height has held still for two frames,
        // then shows already sitting on the end. The settle is bounded so a
        // list that keeps growing (images, late tool output) still appears.
        const reveal = (fade: boolean) => {
            if (finished) return;
            finished = true;
            if (timer !== null) window.clearTimeout(timer);
            const startedAt = performance.now();
            let lastHeight = -1;
            let stableFrames = 0;
            const settle = () => {
                frame = null;
                const node = scrollRef.current;
                let height = -1;
                if (node) {
                    height = node.scrollHeight;
                    if (!endPinningReleasedRef.current) {
                        const end = height - node.clientHeight;
                        if (end - node.scrollTop > 1) node.scrollTop = end;
                    }
                }
                stableFrames = height === lastHeight ? stableFrames + 1 : 0;
                lastHeight = height;
                if (stableFrames < TIMELINE_SETTLE_STABLE_FRAMES && performance.now() - startedAt < TIMELINE_SETTLE_CAP_MS) {
                    frame = window.requestAnimationFrame(settle);
                    return;
                }
                entry.ready = true;
                if (!fade) {
                    root.removeAttribute('data-timeline-reveal');
                    return;
                }
                root.setAttribute('data-timeline-reveal', 'fading');
                // The fade is a filled opacity animation, and a filled
                // animation keeps the root a stacking context for as long
                // as the attribute stays. That would trap the overlay
                // scrollbar (z-30) under the composer slot (z-10): the thumb
                // paints over the composer band but cannot be grabbed there.
                // Drop the attribute once the fade has run (or immediately
                // under reduced motion, where the animation never fires).
                const clearFade = (event?: AnimationEvent) => {
                    // Child entrance animations bubble here too.
                    if (event && event.target !== root) return;
                    if (fadeTimer !== null) window.clearTimeout(fadeTimer);
                    fadeTimer = null;
                    root.removeEventListener('animationend', clearFade);
                    root.removeAttribute('data-timeline-reveal');
                };
                root.addEventListener('animationend', clearFade);
                fadeTimer = window.setTimeout(clearFade, TIMELINE_REVEAL_FADE_MS * 2);
            };
            frame = window.requestAnimationFrame(settle);
        };
        // Holds are taken in layout effects, including those of rows the list
        // mounts in a nested synchronous pass; a microtask runs after all of
        // them and still before the browser paints this commit.
        queueMicrotask(() => {
            if (finished) return;
            revealGate.close();
            if (revealGate.holds === 0) {
                reveal(revealWaitedRef.current);
                return;
            }
            revealGate.onEmpty = () => reveal(true);
            timer = window.setTimeout(() => reveal(true), revealGate.capMs);
        });
        return () => {
            finished = true;
            if (timer !== null) window.clearTimeout(timer);
            if (frame !== null) window.cancelAnimationFrame(frame);
            if (fadeTimer !== null) window.clearTimeout(fadeTimer);
            revealGate.onEmpty = null;
        };
    }, [currentSessionId, currentSessionKey, retainedTimelineCount, revealGate, scrollRef, showingTranscript, timelineRootRef]);

};
