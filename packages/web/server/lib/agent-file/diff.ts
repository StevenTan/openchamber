import { createTwoFilesPatch, diffLines } from 'diff';
import type { FileChange } from './files.js';

export function fileDiff({ file, before, after, status }: FileChange) {
  const counts = diffLines(before, after).reduce((result, item) => ({
    additions: result.additions + (item.added ? (item.count ?? 0) : 0),
    deletions: result.deletions + (item.removed ? (item.count ?? 0) : 0),
  }), { additions: 0, deletions: 0 });
  return { file, patch: createTwoFilesPatch(file, file, before, after), status, ...counts };
}
