import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionRenderable } from '@/sync/sync-context';
import { DisplayedWorkspaceContext } from '@/lib/workspace/panelOwner';
import { useShownSessionSelection } from '../useShownSessionSelection';
import { usePinnedSessionDirectory } from '../usePinnedSessionDirectory';

export type PinnedSelection = { sessionId: string; directory: string | null };

/**
 * Which session the column shows. The selection is published synchronously by
 * the sidebar click, but the chat swaps its content on a deferred copy: the
 * first commit paints the cheap reactions (active row, URL, tab) while the
 * timeline for the new session renders in an interruptible transition behind
 * it. Both fields travel as one value so the key, the message subscription,
 * and the loader target never mix an old directory with a new session id. A
 * pinned column does not subscribe to the selection.
 */
export const useChatColumnSelection = ({
    pinnedSession,
    autoOpenDraft: autoOpenDraftProp,
}: {
    pinnedSession: PinnedSelection | undefined;
    autoOpenDraft: boolean;
}) => {
    const pinned = pinnedSession !== undefined;
    const workspace = React.useContext(DisplayedWorkspaceContext);
    const mainWorkspace = pinned ? null : workspace;
    const autoOpenDraft = autoOpenDraftProp && !pinned;
    // A pinned column starts on its session and moves only through its own
    // navigation. A different session from the owner starts it over.
    const [pinnedOrigin, setPinnedOrigin] = React.useState<PinnedSelection | null>(pinnedSession ?? null);
    const [pinnedSelection, setPinnedSelection] = React.useState<PinnedSelection | null>(pinnedSession ?? null);
    if (pinnedSession && (pinnedSession.sessionId !== pinnedOrigin?.sessionId || pinnedSession.directory !== pinnedOrigin?.directory)) {
        setPinnedOrigin(pinnedSession);
        setPinnedSelection(pinnedSession);
    }
    // Live selection drives main-column navigation policy. Presentation comes
    // from the shared workspace on desktop and the column's deferred selection
    // elsewhere. A pinned column owns its navigation independently.
    const globalSessionId = useSessionUIStore((s) => (pinned ? null : s.currentSessionId));
    const globalSessionDirectory = useSessionUIStore((s) => (pinned ? null : s.currentSessionDirectory));
    const pinnedSessionDirectory = usePinnedSessionDirectory(pinned ? pinnedSelection : null);
    const liveSessionId = pinned ? (pinnedSessionDirectory ? pinnedSelection?.sessionId ?? null : null) : globalSessionId;
    const liveSessionDirectory = pinned ? pinnedSessionDirectory : globalSessionDirectory;
    const materializedDraftSessionId = useSessionUIStore((s) => (pinned ? null : s.materializedDraftSessionId));
    const liveSelection = React.useMemo(
        () => ({ sessionId: mainWorkspace ? null : liveSessionId, directory: mainWorkspace ? null : liveSessionDirectory }),
        [mainWorkspace, liveSessionId, liveSessionDirectory],
    );
    // Desktop main chat follows its workspace's committed selection. Pinned
    // columns and standalone runtimes own the same presentation policy here.
    const liveSessionRenderable = useSessionRenderable(liveSelection.sessionId ?? '', liveSelection.directory ?? undefined);
    const localPresentation = useShownSessionSelection(liveSelection, { renderable: liveSessionRenderable, materializedSessionId: materializedDraftSessionId });
    const { sessionId: currentSessionId, directory: currentSessionDirectory } = mainWorkspace ?? localPresentation.selection;
    const revealWaited = mainWorkspace?.revealWaited ?? localPresentation.revealWaited;

    const liveDraft = useSessionUIStore((s) => mainWorkspace ? null : s.newSessionDraft);
    const newSessionDraft = mainWorkspace?.draft ?? liveDraft;

    return {
        pinned,
        autoOpenDraft,
        pinnedOrigin,
        setPinnedSelection,
        liveSessionId,
        materializedDraftSessionId,
        currentSessionId,
        currentSessionDirectory,
        newSessionDraft,
        revealWaited,
    };
};

/**
 * Selection policy reads the live selection, not the deferred one: right after
 * a click the deferred id still names the previous session (or nothing) for
 * one commit, and acting on that would open a draft over the session the user
 * just chose.
 */
export const useAutoOpenDraft = ({
    autoOpenDraft,
    liveSessionId,
    draftOpen,
}: {
    autoOpenDraft: boolean;
    liveSessionId: string | null;
    draftOpen: boolean;
}): void => {
    const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft);
    React.useEffect(() => {
        if (!autoOpenDraft || liveSessionId || draftOpen) return;
        // Checked again against the store when the effect runs: a session link
        // can select a session between this render and the effect (a startup
        // route, Strict Mode's effect replay), and a draft opened from the
        // stale render would throw that selection away.
        const live = useSessionUIStore.getState();
        if (live.currentSessionId || live.newSessionDraft.open) return;
        // Programmatic fallback, not user navigation — must not clear the
        // persisted last-session pointer the cold-launch restore reads.
        openNewSessionDraft({ automatic: true });
    }, [autoOpenDraft, liveSessionId, draftOpen, openNewSessionDraft]);
};
