import type { useI18n } from '@/lib/i18n';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerRuntime } from './useComposerRuntime';
import type { useComposerReferencePickerState } from './useComposerReferencePickerState';
import type { useComposerReferencePicker } from './useComposerReferencePicker';
import type { useComposerReferenceDrafts } from './useComposerReferenceDrafts';

import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import type { AttachIssueRequest } from '@openchamber/sdk';
import { toast } from '@/components/ui';
import { isMobileSurfaceRuntime } from '@/lib/runtimeSurface';
import { openGuestSurface } from '@/lib/guests/open-surface';
import { guestPanelOpensHere } from '@/lib/guests/phone';
import { type ComposerReference } from '../../composer/composerReferences';

import { trackerPresentation } from '@/lib/trackers/presentation';
import { trackerReferenceSource } from '@/components/references/referencePickerItems';
import type { ComposerTrackerPicker } from '../../composer/ui/ComposerAttachmentControls';
import { useGuestAttachItems } from '@/hooks/useGuestSurfaces';
import { openGuestWithItem } from '@/lib/guests/dialog-store';
import { useGuestsStore } from '@/lib/guests/store';
import { isGuestActive } from '@/lib/guests/capabilities';
import { pluginModeFromId } from '@/lib/surfaces/modes';

type Dependencies = {
    referenceDrafts: Pick<ReturnType<typeof useComposerReferenceDrafts>, 'setAttachDialogItem' | 'setAttachDialogGuestId'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'currentDirectory'>;
    i18n: Pick<ReturnType<typeof useI18n>, 't'>;
    referencePicker: Pick<ReturnType<typeof useComposerReferencePicker>, 'trackerSources'>;
    referencePickerState: Pick<ReturnType<typeof useComposerReferencePickerState>, 'setReferencePicker'>;
    runtime: Pick<ReturnType<typeof useComposerRuntime>, 'isVSCode'>;
};

export function useComposerReferenceActions({
    referenceDrafts, sessionScope, i18n, referencePicker, referencePickerState, runtime,
}: Dependencies) {
    const { setAttachDialogItem, setAttachDialogGuestId } = referenceDrafts;
    const { currentDirectory } = sessionScope;
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
        // The phone's panel is the extension's workspace tab.
        if (isMobileSurfaceRuntime()) {
            openGuestSurface({ mode: pluginModeFromId(guestId), directory: currentDirectory || null, supported: true });
            return;
        }
        useUIStore.getState().openContextSurface(currentDirectory || '', pluginModeFromId(guestId));
    }, [currentDirectory, guestAttachItems, setAttachDialogItem, setAttachDialogGuestId]);

    // Clicking the guest chip reopens that guest with the chip as `ready.item`,
    // so it can show the item's details instead of its whole list. A panel
    // guest gets it through the rail hand-off store; a dialog guest as a prop.
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
        // A chip can outlive the place it was attached in: the session may be
        // open in VS Code, where extensions never load, or the extension may
        // be paused or removed here. Say so instead of opening
        // an empty surface.
        const installed = useGuestsStore.getState().guests.find((entry) => entry.id === issue.providerId);
        if (!installed || !isGuestActive(installed)) {
            const supported = useGuestsStore.getState().status !== 'unsupported';
            toast.info(t(!supported
                ? 'chat.chatInput.toast.guestUnavailableHere'
                : installed ? 'chat.chatInput.toast.guestOff' : 'chat.chatInput.toast.guestRemoved'));
            return;
        }
        // The phone opens an extension's panel or dialog only when it opted into the phone.
        if (!guestPanelOpensHere(installed)) {
            toast.info(t('chat.chatInput.toast.guestNotOnPhone', { name: installed.name }));
            return;
        }
        if (!installed.entry) {
            toast.info(t('chat.chatInput.toast.guestHasNoPanel'));
            return;
        }
        const guest = guestAttachItems.find((entry) => entry.id === issue.providerId);
        // Only an extension that declared a dialog gets one; everything else
        // (panel mode, no attach declared) opens the rail with the item.
        // The panel opens and stays open; a second chip click on an open panel
        // must not toggle it closed with the item still parked.
        if (guest?.mode !== 'dialog') {
            if (!openGuestWithItem({ id: issue.providerId, attach: undefined }, issue, currentDirectory)) {
                toast.info(t('chat.guestLink.noProject', { name: installed.name }));
            }
            return;
        }
        setAttachDialogItem(issue);
        setAttachDialogGuestId(issue.providerId);
    }, [currentDirectory, guestAttachItems, t, setAttachDialogItem, setAttachDialogGuestId]);

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
