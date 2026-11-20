import { isFilesystemError } from '@/lib/api/files-errors';
import type { FilesAPI } from '@/lib/api/types';
import { beginFilePathMove } from '@/lib/filePathMoves';
import { getPanelWorkspaceUI, useUIStore } from '@/stores/useUIStore';

type WorkspacePathMoveResult = 'moved' | 'conflict' | 'failed';

export const moveWorkspacePath = async (
  files: FilesAPI,
  directories: { tabs: string; files: string; workspaceOwner?: string },
  fromPath: string,
  toPath: string,
): Promise<WorkspacePathMoveResult> => {
  if (!files.rename) return 'failed';
  const panel = directories.workspaceOwner ? getPanelWorkspaceUI(directories.workspaceOwner).getState() : useUIStore.getState();

  const move = beginFilePathMove(fromPath);
  try {
    const result = await files.rename(fromPath, toPath);
    if (!result.success) {
      move.abort();
      return 'failed';
    }
  } catch (error) {
    move.abort();
    return isFilesystemError(error) && error.reason === 'already-exists' ? 'conflict' : 'failed';
  }

  move.commit(toPath);
  panel.moveContextFilePaths(directories.tabs, fromPath, toPath, directories.files);
  return 'moved';
};
