import React from 'react';

type SessionSelection = { sessionId: string | null; directory: string | null };
const SESSION_SWITCH_HOLD_MS = 400;

/**
 * The selection a workspace or standalone column renders. A missing session
 * snapshot keeps the previous selection for up to 400 ms; a ready selection
 * commits in a deferred render so list navigation stays responsive.
 *
 * A selection arriving from nothing is taken at once. Leaving a draft or an
 * empty chat has no conversation to keep, and a deferred null beside the draft
 * the store has already closed read as "nothing selected": the column fell
 * back to its empty state for a commit and remounted, composer and work-status
 * card included.
 *
 * The same session in another directory is taken at once too, whatever
 * changed it: the old directory either no longer holds the session or was
 * only a guess, so reading the session there is wrong. A move is the main
 * case: it has already taken the session out of the old directory's store,
 * and a deferred old directory had the chat find it missing there and read
 * it back into the directory it left.
 */
export const useShownSessionSelection = <T extends SessionSelection>(
    target: T,
    { renderable = true, materializedSessionId, newSessionDraftOpen = false }: { renderable?: boolean; materializedSessionId?: string | null; newSessionDraftOpen?: boolean } = {},
) => {
    const shownRef = React.useRef(target);
    const [expiredHold, setExpiredHold] = React.useState<string | null>(null);
    const hold = Boolean(target.sessionId) && !renderable
        && target.sessionId !== materializedSessionId
        && shownRef.current.sessionId !== null
        && shownRef.current.sessionId !== target.sessionId
        && expiredHold !== target.sessionId;
    React.useEffect(() => {
        if (!hold) return;
        const timer = window.setTimeout(() => setExpiredHold(target.sessionId), SESSION_SWITCH_HOLD_MS);
        return () => window.clearTimeout(timer);
    }, [hold, target.sessionId]);
    const lastTarget = React.useRef<string | null | undefined>(undefined);
    const waited = React.useRef<string | null>(null);
    if (lastTarget.current !== target.sessionId) {
        lastTarget.current = target.sessionId;
        waited.current = target.sessionId && !renderable ? target.sessionId : null;
    }
    const next = hold ? shownRef.current : target;
    const deferred = React.useDeferredValue(next);
    const selection = deferred.sessionId === next.sessionId || (newSessionDraftOpen && next.sessionId === null) || (deferred.sessionId === null && next.sessionId !== null)
        ? next : deferred;
    shownRef.current = selection;
    return { selection, revealWaited: Boolean(selection.sessionId) && selection.sessionId === waited.current };
};
