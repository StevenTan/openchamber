import { getRuntimeKey } from '@/lib/runtime-switch';
import type { useI18n } from '@/lib/i18n';
import type { useComposerSessionScope } from './useComposerSessionScope';

import type { useComposerEditorState } from './useComposerEditorState';
import type { useComposerEditorActions } from './useComposerEditorActions';
import type { useComposerDraftText } from './useComposerDraftText';
import type { useComposerAttachmentWork } from './useComposerAttachmentWork';
import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useInputStore } from '@/sync/input-store';

import { toast } from '@/components/ui';
import { opencodeClient } from '@/lib/opencode/client';
import { assignImageAttachmentFilenames, prepareImageToSave, renameFileForAttachmentCitation } from '../../attachmentCitations';

import { withInlineInsertionBoundaries } from '../../composer/text';
import { getFileMentionInputSourceForInsertedText } from './composerMentionTokens';

type Dependencies = {
    editorState: Pick<ReturnType<typeof useComposerEditorState>, 'composerRef'>;
    draftText: Pick<ReturnType<typeof useComposerDraftText>, 'composerText'>;
    i18n: Pick<ReturnType<typeof useI18n>, 't'>;
    attachmentWork: Pick<ReturnType<typeof useComposerAttachmentWork>, 'pendingPastedAttachmentFilenamesRef'>;
    editorActions: Pick<ReturnType<typeof useComposerEditorActions>, 'insertTextAtSelection'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'currentDirectory' | 'addAttachedFile' | 'chatDraftIdentity'>;
};

export function useComposerFileIntake({
    editorState, draftText, i18n, attachmentWork, editorActions, sessionScope,
}: Dependencies) {
    const { composerRef } = editorState;
    const { composerText } = draftText;
    const { t } = i18n;
    const { pendingPastedAttachmentFilenamesRef } = attachmentWork;
    const { insertTextAtSelection } = editorActions;

    const { currentDirectory, addAttachedFile, chatDraftIdentity } = sessionScope;

    const insertPastedText = React.useCallback((text: string) => {
        if (!text) return;
        const editor = composerRef.current;
        const currentMessage = editor?.getValue() ?? composerText.get();
        const selectionStart = editor?.getSelection().start ?? currentMessage.length;
        const selectionEnd = editor?.getSelection().end ?? currentMessage.length;
        const insertionText = withInlineInsertionBoundaries(
            text,
            currentMessage.slice(0, selectionStart),
            currentMessage.slice(selectionEnd),
        );
        insertTextAtSelection(insertionText, getFileMentionInputSourceForInsertedText(insertionText));
    }, [insertTextAtSelection, composerText, composerRef]);

    const savePastedImagesAsFiles = useUIStore((state) => state.savePastedImagesAsFiles);
    const attachFiles = React.useCallback(async (
        files: FileList | File[],
        leadingText: string = '',
        renameImages: boolean = false,
    ): Promise<void> => {
        const draftKey = useInputStore.getState().attachmentDraftKey;
        const runtimeKey = getRuntimeKey();
        const ownsDraft = () => getRuntimeKey() === runtimeKey && useInputStore.getState().attachmentDraftKey === draftKey;
        const reservedNames: string[] = [];
        try {
            let list = Array.from(files);
            if (renameImages) {
                const images = list.filter((file) => file.type.startsWith('image/'));
                const names = assignImageAttachmentFilenames(images, [...useInputStore.getState().attachedFiles.map((file) => file.filename), ...pendingPastedAttachmentFilenamesRef.current]);
                names.forEach((name) => { pendingPastedAttachmentFilenamesRef.current.add(name); reservedNames.push(name); });
                const renamed = new Map(images.map((file, index) => [file, renameFileForAttachmentCitation(file, names[index])]));
                list = list.map((file) => renamed.get(file) ?? file);
            }
            const images = savePastedImagesAsFiles ? list.filter((file) => file.type.startsWith('image/')) : [];
            const savedPaths = new Map<File, string>();
            const saveErrors = new Set<File>();
            if (images.length > 0) {
                const toastId = toast.loading(t('chat.chatInput.toast.imagesSaving', { files: images.map((file) => file.name).join(', ') }));
                try {
                    const prepared = await Promise.all(images.map((file) => prepareImageToSave(file)));
                    const readable = prepared.filter((file) => file !== null);
                    if (!ownsDraft()) return;
                    const saved = await opencodeClient.writeOpenCodeTempFiles(currentDirectory, readable.map(({ filename, bytes }) => ({ filename, bytes })), runtimeKey);
                    for (let index = 0; index < images.length; index++) {
                        const output = prepared[index];
                        const result = output && saved.find((entry) => entry.filename === output.filename);
                        if (result && 'path' in result) savedPaths.set(images[index], result.path);
                        else saveErrors.add(images[index]);
                    }
                } catch (error) {
                    console.error('Saving pasted images failed', error);
                    images.forEach((file) => saveErrors.add(file));
                } finally {
                    toast.dismiss(toastId);
                }
            }
            if (!ownsDraft()) return;
            if (saveErrors.size > 0) toast.error(t('chat.chatInput.toast.imageSaveFailed', { files: [...saveErrors].map((file) => file.name).join(', ') }));
            insertPastedText(leadingText);
            for (const file of list) {
                try {
                    if (!await addAttachedFile(file, chatDraftIdentity, savedPaths.get(file))) throw new Error(t('chat.chatInput.toast.attachFileFailed'));
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : t('chat.chatInput.toast.attachFileFailed'));
                }
                if (!ownsDraft()) return;
            }
        } finally {
            reservedNames.forEach((name) => pendingPastedAttachmentFilenamesRef.current.delete(name));
        }
    }, [addAttachedFile, chatDraftIdentity, currentDirectory, insertPastedText, savePastedImagesAsFiles, t, pendingPastedAttachmentFilenamesRef]);

    return { attachFiles };
}
