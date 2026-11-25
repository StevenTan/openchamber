import React from 'react';
import { useI18n } from '@/lib/i18n';
import { turnDiffClient } from '@/lib/agent/turn-diffs';
import { latestTurnDiffReference, turnDiffReferences } from '@/lib/opencode/turn-file-diffs';
import { useSessionMessagesSelector, useSessionStatus } from '@/sync/sync-context';
import { projectTurnRecords } from '@/components/chat/lib/turns/projectTurnRecords';
import type { TurnSnapshotDiff } from './turnSnapshotDiff';

const EMPTY_DIFFS: TurnSnapshotDiff[] = [];

/** Reads a persisted turn patch; transcript metadata supplies only its reference and revision. */
export function useTurnFileDiffs(sessionId: string | null, directory: string | undefined, { enabled, turnId }: { enabled: boolean; turnId?: string }) {
    const { t } = useI18n();
    const selection = useSessionMessagesSelector(enabled ? sessionId ?? '' : '', directory, React.useCallback((messages, state) => {
        const entries = messages.map((info) => ({ info, parts: state.part[info.id] ?? [] }));
        const turn = turnId ? undefined : projectTurnRecords(entries, { showTurnChangedFiles: false, mergeHiddenUserTurns: true }).turns.at(-1);
        const reference = turnId ? turnDiffReferences(entries).find((entry) => entry.turnID === turnId) : turn ? latestTurnDiffReference(turn.assistantMessages) : undefined;
        return { turnId: turnId ?? reference?.turnID ?? turn?.turnId ?? '', revision: reference?.revision ?? 0, captureError: reference?.error ?? '' };
    }, [turnId]), (left, right) => left.turnId === right.turnId && left.revision === right.revision && left.captureError === right.captureError, true);
    const status = useSessionStatus(enabled ? sessionId ?? '' : '', directory)?.type;
    const [attempt, retry] = React.useReducer((value: number) => value + 1, 0);
    const key = JSON.stringify([sessionId, directory, selection, status, attempt]);
    const [result, setResult] = React.useState<{ key: string; diffs: TurnSnapshotDiff[]; error: string | null } | null>(null);
    React.useEffect(() => {
        if (!enabled || !sessionId) return;
        let cancelled = false;
        const { turnId, captureError } = selection;
        const unavailable = t('diffView.state.turnDiffUnavailable');
        const read = async () => {
            if (!turnId || captureError) throw new Error(unavailable);
            const record = await turnDiffClient.read(sessionId, turnId, directory);
            if (record.unavailable || record.error || !record.files) throw new Error(unavailable);
            return record.files;
        };
        void read().then((diffs) => {
            if (!cancelled) setResult({ key, diffs, error: null });
        }, () => {
            if (!cancelled) setResult({ key, diffs: [], error: unavailable });
        });
        return () => { cancelled = true; };
    }, [directory, enabled, key, selection, sessionId, t]);
    const own = result?.key === key ? result : null;
    return { diffs: own?.diffs ?? EMPTY_DIFFS, count: own && !own.error ? own.diffs.length : null, loaded: own !== null, settled: own !== null, error: own?.error ?? null, retry };
}
