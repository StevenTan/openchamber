import type { EditorAPI } from '@/lib/api/types';
import { findRepoFile, toAbsoluteFilePath } from '@/lib/path-utils';
import type { TurnSnapshotDiff } from '@/components/views/turnSnapshotDiff';

import { extractFirstChangedLineFromDiff } from './parts/toolDiffUtils';

/**
 * VS Code has no side panel for the turn diff, so a changed-file chip opens
 * the file's whole recorded change in the turn in the editor's own diff view.
 */
export const openTurnFileDiffInEditor = async ({
    directory,
    editor,
    file,
    turnDiff,
}: {
    directory: string;
    editor: EditorAPI;
    file: string;
    turnDiff: readonly TurnSnapshotDiff[];
}): Promise<void> => {
    const absolutePath = toAbsoluteFilePath(directory, file);
    const listed = findRepoFile(absolutePath, directory, turnDiff.flatMap((entry) => entry.file ?? []));
    const patch = listed ? turnDiff.find((entry) => entry.file === listed)?.patch : undefined;
    if (!patch) {
        throw new Error('The turn has no recorded diff for this file');
    }
    await editor.openDiff('', absolutePath, undefined, { line: extractFirstChangedLineFromDiff(patch), patch });
};
