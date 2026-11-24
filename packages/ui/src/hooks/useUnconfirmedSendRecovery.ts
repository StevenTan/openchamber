import { conversationClient } from "@/lib/agent/active"
import * as React from 'react';

import { deleteChatDirectory } from '@/lib/chatDirectories';
import type { ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import { getSessionBackend } from '@/lib/agent/registry';
import { captureRuntimeInstance } from '@/lib/runtime-switch';
import { holdPageLock, recoverUnconfirmedSends, type UnconfirmedSendServer } from '@/lib/unconfirmedSends';
import { useSessionDraftsStore } from '@/stores/useSessionDraftsStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { isChatDirectoryStillReferenced, waitForConnectionOrThrow } from '@/sync/session-actions';

type Restore = (target: ChatDraftIdentity, text: string, confirmedMentions: Set<string>) => void;

const absentOnNotFound = async <T>(sessionID: string, read: Promise<T>, absent: T): Promise<T> => {
    try {
        return await read;
    } catch (error) {
        if (error instanceof Error && getSessionBackend(sessionID).runtime.isNotFoundError(error)) return absent;
        throw error;
    }
};

const serverOfThisRuntime = (): UnconfirmedSendServer => ({
    isCurrent: captureRuntimeInstance(),
    ready: waitForConnectionOrThrow,
    sessionDirectory: (sessionId) => absentOnNotFound(
        sessionId,
        conversationClient.getSessionUnscoped(sessionId).then((session) => session.directory ?? null),
        null,
    ),
    hasMessage: (sessionId, messageId, directory) => absentOnNotFound(
        sessionId,
        conversationClient.getSessionMessage(sessionId, messageId, directory).then(() => true),
        false,
    ),
    hasSessionsIn: async (directory) => {
        const sessions = useGlobalSessionsStore.getState();
        if (!sessions.hasLoaded) await sessions.loadSessions();
        if (!useGlobalSessionsStore.getState().hasLoaded) throw new Error('The session list did not load');
        return isChatDirectoryStillReferenced(directory, new Set());
    },
    deleteChatDirectory,
});

export function useUnconfirmedSendRecovery(
    runtimeKey: string | null,
    restore: Restore,
    shownIdentityRef: React.RefObject<ChatDraftIdentity | null>,
): void {
    React.useEffect(() => {
        if (!runtimeKey) return;
        holdPageLock();
        void recoverUnconfirmedSends(runtimeKey, {
            shown: () => shownIdentityRef.current,
            restore,
            discardDraft: (workDraftId) => void useSessionDraftsStore.getState().discard(workDraftId).catch(() => undefined),
        }, serverOfThisRuntime());
    }, [runtimeKey, restore, shownIdentityRef]);
}
