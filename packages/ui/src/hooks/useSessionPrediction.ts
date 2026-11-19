import React from 'react';
import { useSession, useSessionStatus, useSessionStatusSnapshotReady } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';
import { opencodeClient } from '@/lib/opencode/client';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { createSessionPredictionCache, SESSION_PREDICTION_PROMPT } from '@/lib/sessionPrediction';

const predictions = createSessionPredictionCache((target, signal) =>
  opencodeClient.generateSessionText(target.sessionID, SESSION_PREDICTION_PROMPT, target.directory,
    AbortSignal.any([signal, AbortSignal.timeout(30_000)])));

export function useSessionPrediction(sessionID: string | null, directory: string | undefined, enabled: boolean, agent: string | null | undefined) {
  const session = useSession(sessionID ?? '', directory);
  const status = useSessionStatus(sessionID ?? '', directory);
  const statusReady = useSessionStatusSnapshotReady(directory, sessionID ?? undefined);
  const settingEnabled = useUIStore((state) => state.sessionSuggestionEnabled);
  const runtimeKey = getRuntimeKey();
  const ownedDirectory = directory ?? session?.directory ?? '';
  const key = JSON.stringify([runtimeKey, ownedDirectory, sessionID]);
  const revision = session?.time.idle ?? 0;
  const isPlan = agent === 'plan' || session?.agent === 'plan';
  const eligible = enabled && settingEnabled && !isPlan && statusReady && Boolean(sessionID && session && revision)
    && (!status || status.type === 'idle') && !session?.parentID && !session?.revert
    && session?.time.archived === undefined;
  const snapshot = React.useSyncExternalStore(predictions.subscribe,
    React.useCallback(() => predictions.get(key, revision), [key, revision]),
    React.useCallback(() => null, []));

  React.useEffect(() => subscribeRuntimeEndpointWillChange(() => predictions.clear()), []);
  React.useEffect(() => {
    if (!sessionID) return;
    if (!settingEnabled) {
      predictions.clear();
      return;
    }
    if (isPlan || session?.revert || session?.time.archived !== undefined || (statusReady && status && status.type !== 'idle')) {
      predictions.invalidate(key);
      return;
    }
    if (eligible) predictions.load({ key, revision, sessionID, directory: ownedDirectory });
  }, [eligible, isPlan, key, ownedDirectory, revision, sessionID, session?.revert, session?.time.archived, settingEnabled, status, statusReady]);

  const dismiss = React.useCallback(() => predictions.dismiss(key, revision), [key, revision]);
  return { text: eligible ? snapshot?.text ?? null : null, dismiss };
}
