import React from 'react';
import { z } from 'zod';
import { backendRequest } from '@/lib/agent-backends/client';
import { useAgentBackendStore } from '@/lib/agent-backends/store';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useIsVSCodeRuntime } from './useRuntimeAPIs';

const catalogSchema = z.object({ backends: z.array(z.object({ id: z.enum(['opencode', 'antigravity']), label: z.string(), available: z.boolean() })) });

export function useAgentBackendCatalog() {
  const isVSCode = useIsVSCodeRuntime();
  const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
  const choose = useAgentBackendStore(state => state.selectDraftBackend);
  const [catalog, setCatalog] = React.useState<z.infer<typeof catalogSchema> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (isVSCode) return;
    const abort = new AbortController();
    setCatalog(null);
    setError(null);
    choose('opencode');
    void backendRequest('/api/agent-backends', 'GET', undefined, abort.signal).then(value => {
      setCatalog(catalogSchema.parse(value));
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : String(error)); });
    return () => abort.abort();
  }, [runtimeKey, isVSCode, choose]);
  return { catalog, error, isVSCode };
}
