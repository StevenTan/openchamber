import React from 'react';
import type { Message, Part } from '@/lib/opencode/model';
import { useStreamingStore } from '@/sync/streaming';
import {
    useSessionMessageRecords,
    useSessionMessageLoadState,
    useSessionRenderable,
    useSession,
} from '@/sync/sync-context';
import { useIsPageWaiting } from '@/sync/global-blocking-requests';
import { createFirstVisibleSessionPerformanceTracker } from '@/sync/session-load-performance';
import { holdPendingSynthetic } from '../lib/holdPendingSynthetic';
import { getSideChat, sideChatMessages } from '@/lib/sessionSideChatMetadata';

const EMPTY_MESSAGES: Array<{ info: Message; parts: Part[] }> = [];

export const useColumnMessages = ({
    active,
    currentSessionId,
    currentSessionKey,
    effectiveSessionDirectory,
}: {
    active: boolean;
    currentSessionId: string | null;
    currentSessionKey: string | null;
    effectiveSessionDirectory: string | undefined;
}) => {
    const streamingMessageId = useStreamingStore(
        React.useCallback(
            (s) => (currentSessionId ? s.streamingMessageIds.get(currentSessionId) ?? null : null),
            [currentSessionId],
        ),
    );
    const activeStreamingPhase = useStreamingStore(
        React.useCallback(
            (s) => {
                if (!streamingMessageId) return null;
                return s.messageStreamStates.get(streamingMessageId)?.phase ?? null;
            },
            [streamingMessageId],
        ),
    );
    const hasRenderableSessionSnapshot = useSessionRenderable(currentSessionId ?? '', effectiveSessionDirectory);
    const isPageWaiting = useIsPageWaiting(currentSessionId);
    const suspendedMessageId = isPageWaiting ? null : streamingMessageId;
    const sessionMessageRecords = useSessionMessageRecords(currentSessionId ?? '', effectiveSessionDirectory, {
        enabled: active,
        suspendPartUpdates: Boolean(suspendedMessageId),
        suspendPartUpdatesForMessageId: suspendedMessageId,
    });
    const currentSession = useSession(currentSessionId, effectiveSessionDirectory);
    const sideChatMetadata = currentSession?.metadata;
    const sideChat = React.useMemo(() => getSideChat({ metadata: sideChatMetadata }), [sideChatMetadata]);
    const ownMessageRecords = React.useMemo(() => sideChatMessages(sessionMessageRecords, sideChat?.boundary ?? null, (record) => record.info), [sessionMessageRecords, sideChat]);
    const inheritedBoundaryReached = ownMessageRecords.length < sessionMessageRecords.length;
    const sessionMessages = React.useMemo(() => {
        if (!currentSessionId) return EMPTY_MESSAGES;
        return isPageWaiting ? holdPendingSynthetic(ownMessageRecords) : ownMessageRecords;
    }, [currentSessionId, isPageWaiting, ownMessageRecords]);
    const sessionMessageLoadState = useSessionMessageLoadState(
        currentSessionId ?? '',
        effectiveSessionDirectory,
    );
    const [firstVisiblePerformance] = React.useState(createFirstVisibleSessionPerformanceTracker);

    React.useEffect(() => {
        if (!active || !currentSessionKey || !hasRenderableSessionSnapshot || sessionMessages.length === 0) return;
        return firstVisiblePerformance.schedule(currentSessionKey, sessionMessages.length);
    }, [active, currentSessionKey, firstVisiblePerformance, hasRenderableSessionSnapshot, sessionMessages.length]);

    const historyMeta = React.useMemo(() => {
        if (!currentSessionId) return null;
        return {
            limit: sessionMessages.length,
            complete: inheritedBoundaryReached || sessionMessageLoadState.complete || !sessionMessageLoadState.cursor,
            loading: sessionMessageLoadState.status === 'loading',
        };
    }, [currentSessionId, inheritedBoundaryReached, sessionMessageLoadState.complete, sessionMessageLoadState.cursor, sessionMessageLoadState.status, sessionMessages.length]);

    return {
        streamingMessageId,
        activeStreamingPhase,
        hasRenderableSessionSnapshot,
        sessionMessages,
        sessionMessageLoadState,
        historyMeta,
    };
};
