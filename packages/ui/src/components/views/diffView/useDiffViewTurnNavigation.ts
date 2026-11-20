import React from 'react';
import { findRepoFile, toAbsoluteFilePath } from '@/lib/path-utils';
import type { useUIStore } from '@/stores/useUIStore';
import type { TurnSnapshotDiff } from '../turnSnapshotDiff';
import type { DiffScope } from './types';

interface DiffViewTurnNavigationOptions {
    visible: boolean;
    activeDiffScope: DiffScope;
    setDisplayFile: React.Dispatch<React.SetStateAction<string | null>>;
    setDisplayFileStaged: React.Dispatch<React.SetStateAction<boolean>>;
    shouldPinAfterAlignRef: React.RefObject<boolean>;
    pendingScrollTargetRef: React.RefObject<string | null>;
    expandStackedFile: (path: string) => void;
    setScrollRequestNonce: React.Dispatch<React.SetStateAction<number>>;
    pendingTurnDiffFile: ReturnType<typeof useUIStore.getState>['pendingTurnDiffFile'];
    setPendingTurnDiffFile: ReturnType<typeof useUIStore.getState>['setPendingTurnDiffFile'];
    diffScope: DiffScope | null;
    currentSessionId: string | null;
    turnDiffSettled: boolean;
    rootDirectory: string | undefined;
    lastTurnDiffs: TurnSnapshotDiff[];
    setOpenedTurn: React.Dispatch<React.SetStateAction<{ sessionId: string | null; turnId?: string } | null>>;
}

export function useDiffViewTurnNavigation({
    visible, activeDiffScope, setDisplayFile, setDisplayFileStaged, shouldPinAfterAlignRef,
    pendingScrollTargetRef, expandStackedFile, setScrollRequestNonce, pendingTurnDiffFile, diffScope, currentSessionId,
    setPendingTurnDiffFile, turnDiffSettled, rootDirectory, lastTurnDiffs, setOpenedTurn,
}: DiffViewTurnNavigationOptions) {
    const revealListedFile = React.useCallback((path: string) => {
        setDisplayFile(path);
        setDisplayFileStaged(false);
        shouldPinAfterAlignRef.current = true;
        pendingScrollTargetRef.current = path;
        expandStackedFile(path);
        setScrollRequestNonce((value) => value + 1);
    }, [expandStackedFile]);

    // Wait for the selected capture before revealing its requested file.
    React.useEffect(() => {
        if (!pendingTurnDiffFile || !visible) return;
        if (diffScope !== 'turn' || pendingTurnDiffFile.sessionId !== currentSessionId) {
            setPendingTurnDiffFile(null);
            return;
        }
        if (!turnDiffSettled || activeDiffScope !== 'turn') return;
        setOpenedTurn({ sessionId: pendingTurnDiffFile.sessionId, turnId: pendingTurnDiffFile.turnId });
        setPendingTurnDiffFile(null);
        const file = toAbsoluteFilePath(rootDirectory, pendingTurnDiffFile.file);
        const listed = findRepoFile(file, rootDirectory, lastTurnDiffs.flatMap((diff) => diff.file ?? []));
        if (listed) {
            revealListedFile(listed);
            return;
        }
    }, [activeDiffScope, currentSessionId, diffScope, lastTurnDiffs, pendingTurnDiffFile, revealListedFile, rootDirectory, setPendingTurnDiffFile, turnDiffSettled, visible]);

}
