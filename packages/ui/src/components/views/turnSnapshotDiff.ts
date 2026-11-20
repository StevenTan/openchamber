/** One file's persisted net change within a turn. */
export type TurnSnapshotDiff = {
    file?: string;
    status?: string;
    patch?: string;
    additions?: number;
    deletions?: number;
};

export const statusToGitCode = (status?: string): string => {
    if (status === 'added') return 'A';
    if (status === 'deleted') return 'D';
    return 'M';
};
