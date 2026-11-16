import React from 'react';
import { StreamTextBuffer } from '../lib/streamTextBuffer';

const REVEAL_FRAME_MS = 32;

export const useSmoothStreamingText = ({ text, isStreaming, identityKey }: {
    text: string;
    isStreaming: boolean;
    identityKey: string;
}): string => {
    const [snapshot, setSnapshot] = React.useState(() => ({
        identityKey,
        buffer: new StreamTextBuffer(text, performance.now()),
        text,
    }));
    if (snapshot.identityKey !== identityKey) {
        setSnapshot({ identityKey, buffer: new StreamTextBuffer(text, performance.now()), text });
    }
    const buffer = snapshot.buffer;

    React.useLayoutEffect(() => {
        const publish = (value: string) => setSnapshot((current) =>
            current.text === value ? current : { ...current, text: value });
        buffer.update(text, performance.now());
        if (!isStreaming) {
            publish(buffer.flush(performance.now()));
            return;
        }
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let frame: number | null = null;
        let revealedAt = performance.now();
        const cancel = () => {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
        };
        const tick = (now: number) => {
            frame = null;
            if (now - revealedAt >= REVEAL_FRAME_MS) {
                publish(buffer.advance(now));
                revealedAt = now;
            }
            if (buffer.pending) frame = requestAnimationFrame(tick);
        };
        const synchronize = () => {
            cancel();
            if (motion.matches || document.hidden) {
                publish(buffer.flush(performance.now()));
            } else {
                publish(buffer.text);
                if (buffer.pending) frame = requestAnimationFrame(tick);
            }
        };
        synchronize();
        document.addEventListener('visibilitychange', synchronize);
        motion.addEventListener('change', synchronize);
        return () => {
            cancel();
            document.removeEventListener('visibilitychange', synchronize);
            motion.removeEventListener('change', synchronize);
        };
    }, [buffer, isStreaming, text]);

    return !isStreaming || snapshot.identityKey !== identityKey ? text : snapshot.text;
};
