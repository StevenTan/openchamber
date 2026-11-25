import { trackerReferenceSource } from '@/components/references/referencePickerItems';
import { withoutComposerReference, withComposerReferences, composerReferenceKey } from '../../composer/composerReferences';
import { LinkedReferenceRow } from '../../composer/ui/LinkedReferenceRow';
import { SharedPageChip } from '../../sharePages/received/SharedPageChip';
import { formatChangeRequestLabel } from '@/lib/source-control/providers/terminology';
import { useSessionPrediction } from '@/hooks/useSessionPrediction';
import { changeRequestCopy } from '@/lib/source-control/changeRequestCopy';
import { ComposerContextChips } from '../../composer/ui/ComposerContextChips';
import type { useComposerHistorySearchState } from './useComposerHistorySearchState';
import type { useComposerAutocompleteState } from './useComposerAutocompleteState';
import type { useComposerRuntime } from './useComposerRuntime';
import type { useComposerReferencePickerState } from './useComposerReferencePickerState';
import type { useComposerReferenceDrafts } from './useComposerReferenceDrafts';
import type { useComposerLanguage } from './useComposerLanguage';
import type { useI18n } from '@/lib/i18n';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerSessionLifecycle } from './useComposerSessionLifecycle';
import type { useComposerSendAvailability } from './useComposerSendAvailability';
import type { useComposerSelection } from './useComposerSelection';
import type { useComposerReferencePicker } from './useComposerReferencePicker';
import type { useComposerReferenceActions } from './useComposerReferenceActions';
import type { useComposerQueueState } from './useComposerQueueState';
import type { useComposerQueueActions } from './useComposerQueueActions';
import type { useComposerPreferences } from './useComposerPreferences';
import type { useComposerMobileShell } from './useComposerMobileShell';
import type { useComposerInlineContext } from './useComposerInlineContext';
import type { useComposerEditorState } from './useComposerEditorState';
import type { useComposerEditorActions } from './useComposerEditorActions';
import type { useComposerDraftText } from './useComposerDraftText';
import type { useComposerDraftTarget } from './useComposerDraftTarget';
import React from 'react';
import { QueuedMessagesStrip } from '../../QueuedMessagesStrip';
import { AutoReviewStrip } from '../../AutoReviewStrip';
import { PullRequestWatchStrip } from '../../PullRequestWatchStrip';
import { ExtensionWaitStrip } from '../../ExtensionWaitStrip';
import { ModelControls } from '../../ModelControls';
import { ModelControlsLayout } from '../../ModelControlsView';
import { NativeConversationModelControls, ConversationBackendPicker } from '../../ConversationBackendControls';

import { RevertedMessagesStrip } from '../../RevertedMessagesStrip';
import { SessionFolderMissingRow } from '../../SessionFolderMissingRow';
import { SessionTrustPausedRow } from '../../SessionTrustPausedRow';

import { SessionDoneHintRow } from '@/components/chat/SessionDoneHintRow';
import { SessionReviewHintRow } from '@/components/chat/SessionReviewHintRow';
import { BackgroundShellsStrip } from '@/components/chat/BackgroundShellsStrip';
import { ComposerStatusStrip } from '@/components/chat/ComposerStatusStrip';
import { useWorktreeBootstrapPending } from '@/hooks/useWorktreeBootstrapPending';
import { useShownAfter } from '@/hooks/useShownAfter';
import { SessionGoalRow } from '@/components/chat/SessionGoalRow';
import { MemoMobileModelButton, MemoMobileEffortButton, MemoMobileAgentButton } from './memoComposerControls';

const CREATING_SESSION_LINE_DELAY_MS = 300;

type Dependencies = {
    historySearchState: Pick<ReturnType<typeof useComposerHistorySearchState>, 'promptHistorySearch'>;
    autocompleteState: Pick<ReturnType<typeof useComposerAutocompleteState>, 'openAutocomplete'>;
    runtime: Pick<ReturnType<typeof useComposerRuntime>, 'isVSCode'>;
    referencePickerState: Pick<ReturnType<typeof useComposerReferencePickerState>, 'setReferencePicker'>;
    referenceDrafts: Pick<ReturnType<typeof useComposerReferenceDrafts>, 'updateLinkedReferences' | 'contextPreviewHost'>;
    language: Pick<ReturnType<typeof useComposerLanguage>, 'linkedReferences'>;
    draftText: Pick<ReturnType<typeof useComposerDraftText>, 'setMessage'>;
    editorState: Pick<ReturnType<typeof useComposerEditorState>, 'composerRef'>;
    i18n: Pick<ReturnType<typeof useI18n>, 't'>;
    preferences: Pick<ReturnType<typeof useComposerPreferences>, 'isMobile' | 'currentTheme'>;
    mobileShell: Pick<ReturnType<typeof useComposerMobileShell>, 'mobileComposerExpanded' | 'mobileShell'>;
    inlineContext: Pick<ReturnType<typeof useComposerInlineContext>, 'hasDrafts' | 'inlineDraftTarget'>;
    referenceActions: Pick<ReturnType<typeof useComposerReferenceActions>, 'reopenGuestItem'>;
    sendAvailability: Pick<ReturnType<typeof useComposerSendAvailability>, 'hasContent' | 'pendingFirstSend' | 'hasLinkedReferences'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'newSessionDraftOpen' | 'isBtwActive' | 'isBtwPanelVisible' | 'hasPendingForm' | 'currentSessionId' | 'currentSessionDirectoryForSync' | 'currentDirectory' | 'setReviewDialogOpen' | 'sessionFolder' | 'trustPausedDirectory' | 'btwComposerSessionId' | 'inputMode'>;
    queueState: Pick<ReturnType<typeof useComposerQueueState>, 'queuedMessages' | 'parentMessageQueueTarget'>;
    draftTarget: Pick<ReturnType<typeof useComposerDraftTarget>, 'showDraftTargetSelectors' | 'messageWaitsForSpace'>;
    selection: Pick<ReturnType<typeof useComposerSelection>, 'currentAgentName' | 'effectiveBtwSelection' | 'backendID'>;
    queueActions: Pick<ReturnType<typeof useComposerQueueActions>, 'handleQueuedMessageEdit' | 'handleQueuedMessageSend'>;
    sessionLifecycle: Pick<ReturnType<typeof useComposerSessionLifecycle>, 'sessionPhase' | 'handleOpenMobilePanel'>;
    editorActions: Pick<ReturnType<typeof useComposerEditorActions>, 'handleCycleThinking' | 'handleOpenThinkingPanel' | 'handleCycleAgent'>;
    referencePicker: Pick<ReturnType<typeof useComposerReferencePicker>, 'handleOpenAgentPanel' | 'descriptorOf' | 'trackerDescriptors'>;
};

export function useComposerRows({
    draftText, editorState, i18n, preferences, mobileShell: mobile, inlineContext, referenceActions,
    sendAvailability, sessionScope, queueState, draftTarget, selection, queueActions, sessionLifecycle,
    editorActions, referencePicker,
    language,
    referenceDrafts,
    referencePickerState,
    runtime,
    autocompleteState,
    historySearchState,
}: Dependencies) {
    const { promptHistorySearch } = historySearchState;
    const isPromptHistorySearchOpen = promptHistorySearch !== null;
    const { openAutocomplete } = autocompleteState;
    const { isVSCode } = runtime;
    const { setReferencePicker } = referencePickerState;
    const { updateLinkedReferences, contextPreviewHost } = referenceDrafts;
    const { linkedReferences } = language;
    const { setMessage } = draftText;
    const { composerRef } = editorState;
    const { t } = i18n;
    const { isMobile, currentTheme } = preferences;
    const { mobileComposerExpanded, mobileShell } = mobile;
    const { hasDrafts, inlineDraftTarget } = inlineContext;
    const { reopenGuestItem } = referenceActions;
    const { hasContent, pendingFirstSend, hasLinkedReferences } = sendAvailability;
    const {
        newSessionDraftOpen, isBtwActive, isBtwPanelVisible, hasPendingForm, currentSessionId,
        currentSessionDirectoryForSync, currentDirectory, setReviewDialogOpen, sessionFolder,
        trustPausedDirectory, btwComposerSessionId, inputMode,
    } = sessionScope;
    const { queuedMessages, parentMessageQueueTarget } = queueState;
    const { showDraftTargetSelectors, messageWaitsForSpace } = draftTarget;
    const { currentAgentName, effectiveBtwSelection } = selection;
    const { handleQueuedMessageEdit, handleQueuedMessageSend } = queueActions;
    const { sessionPhase, handleOpenMobilePanel } = sessionLifecycle;
    const { handleCycleThinking, handleOpenThinkingPanel, handleCycleAgent } = editorActions;
    const { handleOpenAgentPanel, descriptorOf, trackerDescriptors } = referencePicker;

    // Linked references render as chips beside the attached files, inside the
    // composer box and inside the mobile pill.
    const linkedReferenceChips = !isVSCode && hasLinkedReferences ? (
        <div className="flex flex-wrap items-center gap-2 pt-2">
            {linkedReferences.map((reference) => {
                const key = composerReferenceKey(reference);
                const remove = () => updateLinkedReferences((current) => withoutComposerReference(current, key));
                switch (reference.kind) {
                    case 'repository-issue':
                        return (
                            <LinkedReferenceRow
                                key={key}
                                numberLabel={`#${reference.number}`}
                                title={reference.title}
                                url={reference.url}
                                author={reference.author}
                                openInBrowserLabel={t('chat.chatInput.linked.issue.openInBrowserAria')}
                                removeLabel={t('chat.chatInput.linked.issue.removeAria')}
                                onReopenPicker={() => setReferencePicker({ source: 'repository', kind: 'issue' })}
                                onRemove={remove}
                            />
                        );
                    case 'repository-discussion':
                        return (
                            <LinkedReferenceRow
                                key={key}
                                numberLabel={`#${reference.number}`}
                                title={reference.title}
                                url={reference.url}
                                author={reference.author}
                                openInBrowserLabel={t('chat.chatInput.linked.discussion.openInBrowserAria')}
                                removeLabel={t('chat.chatInput.linked.discussion.removeAria')}
                                onReopenPicker={() => setReferencePicker({ source: 'repository', kind: 'discussion' })}
                                onRemove={remove}
                            />
                        );
                    case 'change-request':
                        return (
                            <LinkedReferenceRow
                                key={key}
                                numberLabel={formatChangeRequestLabel(descriptorOf(reference.provider), reference.number)}
                                title={reference.title}
                                url={reference.url}
                                author={reference.author}
                                branches={reference.head && reference.base ? { head: reference.head, base: reference.base } : undefined}
                                openInBrowserLabel={t(changeRequestCopy('chat.chatInput.linked.pr.openInBrowserAria', descriptorOf(reference.provider).terminology.changeRequest))}
                                removeLabel={t(changeRequestCopy('chat.chatInput.linked.pr.removeAria', descriptorOf(reference.provider).terminology.changeRequest))}
                                onReopenPicker={() => setReferencePicker({ source: 'repository', kind: 'pull' })}
                                onRemove={remove}
                            />
                        );
                    case 'tracker-item': {
                        const trackerName = trackerDescriptors.find((descriptor) => descriptor.id === reference.provider)?.name ?? reference.provider;
                        return (
                            <LinkedReferenceRow
                                key={key}
                                numberLabel={reference.identifier}
                                title={reference.title}
                                url={reference.url}
                                author={reference.author}
                                openInBrowserLabel={t('chat.chatInput.linked.trackerItem.openInBrowserAria', { provider: trackerName })}
                                removeLabel={t('chat.chatInput.linked.trackerItem.removeAria', { provider: trackerName })}
                                onReopenPicker={() => setReferencePicker({ source: trackerReferenceSource(reference.provider) })}
                                onRemove={remove}
                            />
                        );
                    }
                    case 'shared-page':
                        return (
                            <SharedPageChip
                                key={key}
                                reference={reference}
                                onChange={(next) => updateLinkedReferences((current) => withComposerReferences(current, [next]))}
                                onRemove={remove}
                            />
                        );
                    case 'guest':
                        return (
                            <LinkedReferenceRow
                                key={key}
                                numberLabel={reference.thread === 'pull'
                                    ? t('chat.chatInput.linked.guest.pr.number', { id: reference.id })
                                    : reference.id}
                                title={reference.title}
                                url={reference.url}
                                author={reference.author ? { login: reference.author } : undefined}
                                branches={reference.thread === 'pull' && reference.head && reference.base
                                    ? { head: reference.head, base: reference.base }
                                    : undefined}
                                openInBrowserLabel={t('chat.chatInput.linked.guest.openInBrowserAria', { id: reference.id })}
                                removeLabel={t('chat.chatInput.linked.guest.removeAria', { id: reference.id })}
                                onReopenPicker={() => reopenGuestItem(reference)}
                                onRemove={remove}
                            />
                        );
                }
            })}
        </div>
    ) : null;
    // Pending context (review comments, quotes, terminal selections) sits in
    // the attachment row like any attachment; its preview opens above the
    // composer, outside the clipping box.
    const contextChips = hasDrafts ? (
        <ComposerContextChips
            draftTarget={inlineDraftTarget}
            colors={currentTheme.colors}
            previewHost={contextPreviewHost}
            isMobile={isMobile}
        />
    ) : null;
    const { text: sessionPrediction, dismiss: dismissPrediction } = useSessionPrediction(
        currentSessionId, currentSessionDirectoryForSync ?? currentDirectory,
        !newSessionDraftOpen && !isBtwActive && inputMode === 'normal',
        currentAgentName,
    );
    const predictionText = !hasContent && !isBtwPanelVisible && queuedMessages.length === 0
        && !hasPendingForm && openAutocomplete === null && !isPromptHistorySearchOpen ? sessionPrediction : null;
    const applyPrediction = React.useCallback(() => {
        if (!predictionText) return;
        dismissPrediction();
        setMessage(predictionText);
        if (isMobile && !mobileComposerExpanded) mobileShell.expand();
        else requestAnimationFrame(() => composerRef.current?.focus());
    }, [predictionText, dismissPrediction, isMobile, mobileComposerExpanded, mobileShell, setMessage, composerRef]);
    const doneHintRow = !isBtwActive && !newSessionDraftOpen ? (
        <SessionDoneHintRow
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
        />
    ) : null;
    // The offer to look over what the last turn changed takes the same slot;
    // the server writes either it or the done hint, never both. Neither the
    // AI review nor the walkthrough is offered on a mobile layout.
    const openReviewDialog = React.useCallback(() => setReviewDialogOpen(true), [setReviewDialogOpen]);
    const reviewHintRow = !isBtwActive && !newSessionDraftOpen && !isMobile ? (
        <SessionReviewHintRow
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
            onAIReview={openReviewDialog}
        />
    ) : null;
    // Commands the agent left running sit in the same slot, first, so a
    // forgotten dev server is visible without scrolling the chat. Keyed by
    // session so an expanded list collapses on a session switch.
    const backgroundShellsRow = !isBtwActive && !newSessionDraftOpen ? (
        <BackgroundShellsStrip
            key={currentSessionId ?? ''}
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
        />
    ) : null;
    // A new worktree still running its setup commands, first of all: until it
    // ends, a first prompt can wait with nothing else saying why.
    const worktreeSetupDirectory = currentSessionDirectoryForSync ?? currentDirectory ?? null;
    const worktreeSetupPending = useWorktreeBootstrapPending(isBtwActive ? null : worktreeSetupDirectory);
    const worktreeSetupRow = worktreeSetupPending
        ? <ComposerStatusStrip icon="loader-4" spin text={t('chat.worktreeSetup.running')} />
        : null;
    // The first message is on screen while the server still creates its
    // session; this says why Send waits. A worktree's setup line already does.
    // A fast server answers within the delay, and then nothing flashes.
    const creatingSession = Boolean(pendingFirstSend && !pendingFirstSend.sessionCreated && !worktreeSetupPending);
    const creatingSessionRow = useShownAfter(creatingSession, CREATING_SESSION_LINE_DELAY_MS)
        ? <ComposerStatusStrip icon="loader-4" spin text={t('chat.draft.creatingSession')} />
        : null;
    // A message sent while its space is still being made waits for it; the
    // composer is empty then, so this row is the only sign it was not lost.
    const spaceWaitRow = showDraftTargetSelectors && messageWaitsForSpace
        ? <ComposerStatusStrip icon="time" text={t('spaces.draft.queued')} />
        : null;
    const autoReviewRow = !isBtwActive && !newSessionDraftOpen ? <AutoReviewStrip /> : null;
    // The agent waits on its pull requests; the server wakes it. Keyed by
    // session, as the commands below, so an expanded list collapses on a
    // switch; the prefix keeps the two keys of this fragment apart.
    const prWatchRow = !isBtwActive && !newSessionDraftOpen ? <PullRequestWatchStrip key={`pr-watch:${currentSessionId ?? ''}`} sessionId={currentSessionId} /> : null;
    // The agent waits on a timer or on something an extension follows; the server wakes it.
    const extensionWaitRow = !isBtwActive && !newSessionDraftOpen ? <ExtensionWaitStrip sessionId={currentSessionId} /> : null;
    // The session's goal, then what is still running, then what waits for it.
    const goalRow = !isBtwActive ? (
        <SessionGoalRow
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
        />
    ) : null;
    const revertRow = !isBtwActive && !newSessionDraftOpen ? (
        <RevertedMessagesStrip
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
        />
    ) : null;
    const queueRow = !isBtwActive && !newSessionDraftOpen ? (
        <QueuedMessagesStrip
            target={parentMessageQueueTarget}
            composerAgentName={currentAgentName}
            onEditMessage={handleQueuedMessageEdit}
            onSendMessage={handleQueuedMessageSend}
        />
    ) : null;
    const folderMissingRow = sessionFolder.missing && currentSessionId && currentSessionDirectoryForSync && !isBtwActive && !newSessionDraftOpen
        ? <SessionFolderMissingRow sessionId={currentSessionId} directory={currentSessionDirectoryForSync} busy={sessionPhase !== 'idle'} />
        : null;
    // A folder the user declined to trust loads no agent or model; the row
    // brings the prompt back. A missing folder says more, so it wins.
    const trustPausedRow = trustPausedDirectory && !folderMissingRow && !isBtwActive
        ? <SessionTrustPausedRow directory={trustPausedDirectory} />
        : null;
    const composerTopRows = folderMissingRow || trustPausedRow || worktreeSetupRow || creatingSessionRow || spaceWaitRow || goalRow || autoReviewRow || prWatchRow || extensionWaitRow || backgroundShellsRow || revertRow || queueRow || doneHintRow || reviewHintRow ? (
        <>
            {folderMissingRow}
            {trustPausedRow}
            {worktreeSetupRow}
            {creatingSessionRow}
            {spaceWaitRow}
            {goalRow}
            {autoReviewRow}
            {prWatchRow}
            {extensionWaitRow}
            {backgroundShellsRow}
            {revertRow}
            {queueRow}
            {doneHintRow}
            {reviewHintRow}
        </>
    ) : null;
    const mobileModelAgentRow = isMobile ? (
        <div className="flex items-center justify-between gap-x-2 px-3.5 pb-2 pt-0.5">
            {isBtwActive ? (
                <ModelControls
                    sessionId={btwComposerSessionId}
                    selection={effectiveBtwSelection}
                    rememberVariantPicks={false}
                />
            ) : (
                <>
                    <ConversationBackendPicker />
                    {selection.backendID === 'antigravity' ? <NativeConversationModelControls className="flex-1" /> : <ModelControlsLayout className="flex-1" spread
                        model={<MemoMobileModelButton onOpenModel={() => handleOpenMobilePanel('model')} className="min-w-0 px-0" />}
                        effort={<MemoMobileEffortButton onCycleThinking={handleCycleThinking} onOpenThinking={handleOpenThinkingPanel} />}
                        agent={<MemoMobileAgentButton onOpenAgentPanel={handleOpenAgentPanel} onCycleAgent={handleCycleAgent} className="flex-shrink-0 px-0" />}
                    />}

                </>
            )}
        </div>
    ) : null;

    return {
        composerTopRows, linkedReferenceChips, contextChips, predictionText, dismissPrediction, applyPrediction, mobileModelAgentRow,
    };
}
