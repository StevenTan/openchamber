import type { useI18n } from '@/lib/i18n';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerRuntime } from './useComposerRuntime';
import type { useComposerReferencePickerState } from './useComposerReferencePickerState';
import type { useComposerReferencePicker } from './useComposerReferencePicker';
import type { useComposerReferenceDrafts } from './useComposerReferenceDrafts';
import type { useComposerColumn } from './useComposerColumn';

import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import type { AttachIssueRequest } from '@openchamber/sdk';
import { toast } from '@/components/ui';
import { isMobileSurfaceRuntime } from '@/lib/runtimeSurface';
import { openGuestSurface } from '@/lib/guests/open-surface';
import { guestPanelOpensHere } from '@/lib/guests/phone';
import { withComposerReferences, type ComposerReference } from '../../composer/composerReferences';
import { usePendingComposerReferences, resolveComposerReferenceHandoffTarget, type ComposerReferenceHandoff } from '../../composer/pendingComposerReferences';

import { trackerPresentation } from '@/lib/trackers/presentation';
import { trackerReferenceSource } from '@/components/references/referencePickerItems';
import type { ComposerTrackerPicker } from '../../composer/ui/ComposerAttachmentControls';
import { useGuestAttachItems } from '@/hooks/useGuestSurfaces';
import { openGuestWithItem } from '@/lib/guests/dialog-store';
import { useGuestsStore } from '@/lib/guests/store';
import { isGuestActive } from '@/lib/guests/capabilities';
import { pluginModeFromId } from '@/lib/surfaces/modes';

type Dependencies = {
    referenceDrafts: Pick<ReturnType<typeof useComposerReferenceDrafts>, 'setAttachDialogItem' | 'setAttachDialogGuestId' | 'handleGuestAttach' | 'updateLinkedReferences'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'currentDirectory' | 'pendingGuestIssue' | 'isBtwActive' | 'consumePendingGuestIssue' | 'currentSessionId' | 'newSessionDraftOpen' | 'newSessionDraft' | 'activeRuntimeKey' | 'pendingComposerReferenceCount'>;
    column: Pick<ReturnType<typeof useComposerColumn>, 'columnPinned'>;
    i18n: Pick<ReturnType<typeof useI18n>, 't'>;
    referencePicker: Pick<ReturnType<typeof useComposerReferencePicker>, 'trackerSources'>;
    referencePickerState: Pick<ReturnType<typeof useComposerReferencePickerState>, 'setReferencePicker'>;
    runtime: Pick<ReturnType<typeof useComposerRuntime>, 'isVSCode'>;
};

export function useComposerReferenceActions({
    referenceDrafts, sessionScope, column, i18n, referencePicker, referencePickerState, runtime,
}: Dependencies) {
    const { setAttachDialogItem, setAttachDialogGuestId, handleGuestAttach, updateLinkedReferences } = referenceDrafts;
    const { currentDirectory, pendingGuestIssue, isBtwActive, consumePendingGuestIssue, currentSessionId, newSessionDraftOpen, newSessionDraft, activeRuntimeKey, pendingComposerReferenceCount } = sessionScope;
    const { columnPinned } = column;
    const { t } = i18n;



    const { trackerSources } = referencePicker;
    const { setReferencePicker } = referencePickerState;
    const { isVSCode } = runtime;

    const guestAttachItems = useGuestAttachItems();

    const openGuestAttach = React.useCallback((guestId: string) => {
        const item = guestAttachItems.find((guest) => guest.id === guestId);
        if (item?.mode === 'dialog') {
            setAttachDialogItem(null);
            setAttachDialogGuestId(guestId);
            return;
        }
        if (isMobileSurfaceRuntime()) {
            openGuestSurface({ mode: pluginModeFromId(guestId), directory: currentDirectory || null, supported: true });
            return;
        }
        useUIStore.getState().openContextSurface(currentDirectory || '', pluginModeFromId(guestId));
    }, [currentDirectory, guestAttachItems, setAttachDialogItem, setAttachDialogGuestId]);

    const reopenGuestItem = React.useCallback((reference: Extract<ComposerReference, { kind: 'guest' }>) => {
        const issue: AttachIssueRequest = {
            providerId: reference.providerId,
            id: reference.id,
            title: reference.title,
            url: reference.url,
            text: reference.contextText,
            kind: reference.thread,
        };
        if (reference.author) issue.author = reference.author;
        if (reference.head && reference.base) {
            issue.branches = { head: reference.head, base: reference.base };
        }
        if (reference.data !== undefined) issue.data = reference.data;
        const installed = useGuestsStore.getState().guests.find((entry) => entry.id === issue.providerId);
        if (!installed || !isGuestActive(installed)) {
            const supported = useGuestsStore.getState().status !== 'unsupported';
            toast.info(t(!supported
                ? 'chat.chatInput.toast.guestUnavailableHere'
                : installed ? 'chat.chatInput.toast.guestOff' : 'chat.chatInput.toast.guestRemoved'));
            return;
        }
        if (!guestPanelOpensHere(installed)) {
            toast.info(t('chat.chatInput.toast.guestNotOnPhone', { name: installed.name }));
            return;
        }
        if (!installed.entry) {
            toast.info(t('chat.chatInput.toast.guestHasNoPanel'));
            return;
        }
        const guest = guestAttachItems.find((entry) => entry.id === issue.providerId);
        if (guest?.mode !== 'dialog') {
            if (!openGuestWithItem({ id: issue.providerId, attach: undefined }, issue, currentDirectory)) {
                toast.info(t('chat.guestLink.noProject', { name: installed.name }));
            }
            return;
        }
        setAttachDialogItem(issue);
        setAttachDialogGuestId(issue.providerId);
    }, [currentDirectory, guestAttachItems, t, setAttachDialogItem, setAttachDialogGuestId]);

    React.useEffect(() => {
        if (!pendingGuestIssue || columnPinned || isBtwActive) {
            return;
        }
        const issue = consumePendingGuestIssue();
        if (issue) {
            handleGuestAttach(issue);
        }
    }, [columnPinned, consumePendingGuestIssue, handleGuestAttach, isBtwActive, pendingGuestIssue]);

    const composerReferenceHandoffTarget = React.useMemo<ComposerReferenceHandoff | null>(() => (
        resolveComposerReferenceHandoffTarget({
            columnPinned,
            btwActive: isBtwActive,
            currentSessionId,
            draftOpen: newSessionDraftOpen,
            workDraftId: newSessionDraft?.workDraftId ?? null,
            runtimeKey: activeRuntimeKey,
        })
    ), [activeRuntimeKey, columnPinned, currentSessionId, isBtwActive, newSessionDraft?.workDraftId, newSessionDraftOpen]);

    React.useEffect(() => {
        if (pendingComposerReferenceCount === 0 || !composerReferenceHandoffTarget) return;
        const references = usePendingComposerReferences.getState().consume(composerReferenceHandoffTarget);
        if (references.length > 0) {
            updateLinkedReferences((current) => withComposerReferences(current, references));
        }
    }, [composerReferenceHandoffTarget, pendingComposerReferenceCount, updateLinkedReferences]);

    const trackerPickers = React.useMemo<readonly ComposerTrackerPicker[]>(() => (
        !isVSCode
            ? trackerSources.map((descriptor) => {
                const presentation = trackerPresentation(descriptor.id);
                return {
                    provider: descriptor.id,
                    icon: presentation.icon,
                    label: t('chat.chatInput.actions.linkTrackerItem', { provider: descriptor.name }),
                    open: () => setReferencePicker({ source: trackerReferenceSource(descriptor.id) }),
                };
            })
            : []
    ), [isVSCode, t, trackerSources, setReferencePicker]);

    return {
        reopenGuestItem, trackerPickers, guestAttachItems, openGuestAttach,
    };
}
