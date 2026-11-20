import { useTrackerDescriptors } from '@/lib/trackers/registry';
import { useSourceControlDescriptorOf, useSourceControlProvider } from '@/lib/source-control/providers/registry';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerReferencePickerState } from './useComposerReferencePickerState';
import type { useComposerReferenceDrafts } from './useComposerReferenceDrafts';
import type { useComposerMobilePanels } from './useComposerMobilePanels';
import type { useComposerLanguage } from './useComposerLanguage';
import React from 'react';

import { isVSCodeRuntime } from '@/lib/desktop';
import { useAttachReferences } from '@/components/references/useAttachReferences';
import { useRepositoryReferenceProvider } from '@/components/references/referenceSources';
import { withComposerReferences, type ComposerReference } from '../../composer/composerReferences';

import { useTrackerSources } from '@/lib/trackers/sources';

type Dependencies = {
    mobilePanels: Pick<ReturnType<typeof useComposerMobilePanels>, 'setMobileControlsPanel'>;
    referencePickerState: Pick<ReturnType<typeof useComposerReferencePickerState>, 'setReferencePicker'>;
    language: Pick<ReturnType<typeof useComposerLanguage>, 'referencePickerDirectory'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'isBtwActive' | 'chatDraftIdentity'>;
    referenceDrafts: Pick<ReturnType<typeof useComposerReferenceDrafts>, 'updateLinkedReferencesFor'>;
};

export function useComposerReferencePicker({
    mobilePanels, referencePickerState, language, sessionScope, referenceDrafts,
}: Dependencies) {
    const { setMobileControlsPanel } = mobilePanels;
    const { setReferencePicker } = referencePickerState;
    const { referencePickerDirectory } = language;
    const { isBtwActive, chatDraftIdentity } = sessionScope;
    const { updateLinkedReferencesFor } = referenceDrafts;

    const handleOpenAgentPanel = React.useCallback(() => {
        setMobileControlsPanel('agent');
    }, [setMobileControlsPanel]);

    const openGitHubPicker = React.useCallback(() => {
        setReferencePicker({ source: 'repository' });
    }, [setReferencePicker]);

    const repositoryProvider = useRepositoryReferenceProvider(isVSCodeRuntime() ? null : referencePickerDirectory);

    const repositoryDescriptor = useSourceControlProvider(repositoryProvider);

    const descriptorOf = useSourceControlDescriptorOf();
    const addLinkedReferences = React.useCallback((references: ComposerReference[]) => {
        if (isBtwActive) return;
        updateLinkedReferencesFor(chatDraftIdentity, (current) => withComposerReferences(current, references));
    }, [chatDraftIdentity, isBtwActive, updateLinkedReferencesFor]);

    const attachReferences = useAttachReferences(referencePickerDirectory, addLinkedReferences);

    const trackerDescriptors = useTrackerDescriptors();
    const trackerSources = useTrackerSources();

    return {
        descriptorOf, trackerDescriptors, trackerSources, handleOpenAgentPanel, openGitHubPicker, repositoryProvider, attachReferences,
        repositoryDescriptor,
    };
}
