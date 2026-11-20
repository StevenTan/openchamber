import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerPreferences } from './useComposerPreferences';
import type { useComposerColumn } from './useComposerColumn';
import React from 'react';
import { useInputStore, type ComposerAddress } from '@/sync/input-store';

import { getInlineCommentDraftKey, useInlineCommentDraftStore, type InlineCommentDraftTarget } from '@/stores/useInlineCommentDraftStore';

import { useMobileCommentComposerController } from '../../composer/comment/MobileCommentComposerContext';

type Dependencies = {
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'isBtwActive' | 'btwComposerSessionId' | 'currentSessionId' | 'newSessionDraftOpen' | 'currentSessionDirectoryForSync' | 'currentDirectory' | 'activeRuntimeKey' | 'chatDraftIdentity'>;
    column: Pick<ReturnType<typeof useComposerColumn>, 'columnPinned'>;
    preferences: Pick<ReturnType<typeof useComposerPreferences>, 'isMobile'>;
};

export function useComposerInlineContext({
    sessionScope, column, preferences,
}: Dependencies) {
    const { isBtwActive, btwComposerSessionId, currentSessionId, newSessionDraftOpen, currentSessionDirectoryForSync, currentDirectory, activeRuntimeKey, chatDraftIdentity } = sessionScope;
    const { columnPinned } = column;
    const { isMobile } = preferences;

    const inlineDraftSessionKey = isBtwActive ? btwComposerSessionId ?? '' : currentSessionId ?? (newSessionDraftOpen ? 'draft' : '');

    const inlineDraftDirectory = currentSessionDirectoryForSync ?? currentDirectory;

    const inlineDraftTarget = React.useMemo<InlineCommentDraftTarget | null>(
        () => inlineDraftSessionKey && inlineDraftDirectory
            ? { directory: inlineDraftDirectory, sessionKey: inlineDraftSessionKey }
            : null,
        [inlineDraftDirectory, inlineDraftSessionKey],
    );

    const inlineDraftKey = inlineDraftTarget
        ? getInlineCommentDraftKey(activeRuntimeKey, inlineDraftTarget.directory, inlineDraftTarget.sessionKey)
        : null;

    const composerAddress = React.useMemo<ComposerAddress | null>(
        () => ({ inline: inlineDraftTarget, attachments: chatDraftIdentity }),
        [chatDraftIdentity, inlineDraftTarget],
    );

    React.useLayoutEffect(() => {
        if (columnPinned) return;
        useInputStore.getState().setComposerAddress(composerAddress);
        return () => useInputStore.getState().setComposerAddress(null);
    }, [columnPinned, composerAddress]);

    const draftCount = useInlineCommentDraftStore(
        React.useCallback(
            (state) => inlineDraftKey ? (state.drafts[inlineDraftKey] ?? []).length : 0,
            [inlineDraftKey]
        )
    );

    const consumeDrafts = useInlineCommentDraftStore((state) => state.consumeDrafts);

    const hasDrafts = draftCount > 0;

    const mobileCommentController = useMobileCommentComposerController();

    const isMobileCommentOpen = React.useCallback(
        () => isMobile && mobileCommentController?.getState().status === 'open',
        [isMobile, mobileCommentController],
    );

    const attachMobileCommentRef = React.useRef<() => void>(() => undefined);

    return {
        inlineDraftSessionKey, hasDrafts, isMobileCommentOpen, inlineDraftTarget,
        consumeDrafts, inlineDraftDirectory, attachMobileCommentRef,
    };
}
