import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionRenderable } from '@/sync/sync-context';
import { DisplayedWorkspaceContext } from '@/lib/workspace/panelOwner';
import { useShownSessionSelection } from '../useShownSessionSelection';
import { usePinnedSessionDirectory } from '../usePinnedSessionDirectory';

export type PinnedSelection = { sessionId: string; directory: string | null };

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
    const draftOpen = useSessionUIStore((s) => !pinned && s.newSessionDraft.open);
    const liveSelection = React.useMemo(
        () => ({ sessionId: mainWorkspace ? null : liveSessionId, directory: mainWorkspace ? null : liveSessionDirectory }),
        [mainWorkspace, liveSessionId, liveSessionDirectory],
    );
    // Desktop main chat follows its workspace's committed selection. Pinned
    // columns and standalone runtimes own the same presentation policy here.
    const liveSessionRenderable = useSessionRenderable(liveSelection.sessionId ?? '', liveSelection.directory ?? undefined);
    const localPresentation = useShownSessionSelection(liveSelection, { renderable: liveSessionRenderable, materializedSessionId: materializedDraftSessionId, newSessionDraftOpen: draftOpen });
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
        const live = useSessionUIStore.getState();
        if (live.currentSessionId || live.newSessionDraft.open) return;
        openNewSessionDraft({ automatic: true });
    }, [autoOpenDraft, liveSessionId, draftOpen, openNewSessionDraft]);
};
