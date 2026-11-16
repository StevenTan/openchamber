import { describe, expect, test } from 'bun:test';

import {
    resolveAssistantTextStreaming,
} from './assistantTextVisibility';

describe('resolveAssistantTextStreaming', () => {
    test('streams live text whose part is not sealed', () => {
        expect(resolveAssistantTextStreaming({
            streamPhase: 'streaming',
            isFinalized: false,
        })).toBe(true);
        expect(resolveAssistantTextStreaming({
            streamPhase: 'cooldown',
            isFinalized: false,
        })).toBe(true);
    });

    test('releases a sealed part even while the turn stays blocked (#3277)', () => {
        // A message blocked on a pending question keeps the stream phase
        // forever; the pre-question text part is sealed (time.end is set the
        // moment the model moves on to the question) and must render in full.
        expect(resolveAssistantTextStreaming({
            streamPhase: 'streaming',
            isFinalized: true,
        })).toBe(false);
        expect(resolveAssistantTextStreaming({
            streamPhase: 'cooldown',
            isFinalized: true,
        })).toBe(false);
    });
});
