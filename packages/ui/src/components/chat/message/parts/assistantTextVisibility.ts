import type { StreamPhase } from '../types';

// Sealed parts render in full even when a question or permission keeps the turn live.
export const resolveAssistantTextStreaming = (input: {
    streamPhase: StreamPhase;
    isFinalized: boolean;
}): boolean => {
    if (input.isFinalized) {
        return false;
    }
    return input.streamPhase === 'streaming' || input.streamPhase === 'cooldown';
};
