import React from 'react';
import { create } from 'zustand';
import { getAgentBackend } from '@/lib/agent/active';
import type { ProviderCatalog } from '@/lib/agent/client';
import type { Session } from '@/lib/agent/model';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useSessionSelector } from '@/sync/sync-context';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import { useIsVSCodeRuntime } from '@/hooks/useRuntimeAPIs';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';

const useNativeCatalogs = create<{
  catalogs: Record<string, ProviderCatalog>;
  errors: Record<string, string | undefined>;
}>(() => ({ catalogs: {}, errors: {} }));
const sessionRecord = (session: Session | undefined) => session;

export function useConversationBackend() {
  const { sessionId, directory } = useChatSessionSelection();
  const draft = useSessionUIStore(state => state.newSessionDraft);
  const activeDirectory = useDirectoryStore(state => state.currentDirectory);
  const session = useSessionSelector(sessionId, directory ?? undefined, sessionRecord);
  const backendID = sessionId ? session?.backendID ?? (sessionId.startsWith('ses_ag_') ? 'antigravity' : 'opencode') : draft.backendID ?? 'opencode';
  const folder = directory ?? draft.directoryOverride ?? activeDirectory;
  const key = sessionId ?? `draft:${getRuntimeKey()}:${draft.draftId}`;
  const catalogKey = `${getRuntimeKey()}:${key}:${folder}`;
  const catalog = useNativeCatalogs(state => state.catalogs[catalogKey]);
  const error = useNativeCatalogs(state => state.errors[catalogKey]);
  const picked = useSelectionStore(state => state.getSessionModelSelection(key));
  const modelID = picked?.modelId ?? session?.model?.id ?? catalog?.default?.id ?? '';
  const model = catalog?.models.find(item => item.id === modelID);
  const variant = useSelectionStore(state => state.getAgentModelVariantForSession(key, 'antigravity', 'antigravity', modelID))
    ?? session?.model?.variant ?? catalog?.default?.variant ?? undefined;
  return { backendID, sessionId, folder, key, catalogKey, catalog, error, modelID, model, variant, materialized: Boolean(session) };
}

export function useNativeConversationCatalog(selection: ReturnType<typeof useConversationBackend>) {
  const { backendID, sessionId, folder, catalogKey, materialized } = selection;
  const isVSCode = useIsVSCodeRuntime();
  const enterprise = useEnterpriseMode();
  const enabled = !isVSCode && !enterprise && (!sessionId || (backendID === 'antigravity' && materialized));
  React.useEffect(() => {
    if (!enabled) return;
    void getAgentBackend('antigravity').client.getProvidersForConfig(folder, { sessionID: sessionId ?? undefined }).then(
      catalog => useNativeCatalogs.setState(state => ({ catalogs: { ...state.catalogs, [catalogKey]: catalog }, errors: { ...state.errors, [catalogKey]: undefined } })),
      cause => useNativeCatalogs.setState(state => ({ errors: { ...state.errors, [catalogKey]: cause instanceof Error ? cause.message : String(cause) } })),
    );
  }, [enabled, sessionId, folder, catalogKey]);
}
