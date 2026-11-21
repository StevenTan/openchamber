import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useAgentBackendStore } from '@/lib/agent-backends/store';
import { useAgentBackendCatalog } from '@/hooks/useAgentBackendCatalog';

export function AgentBackendPicker() {
  const { t } = useI18n();
  const { catalog, error, isVSCode } = useAgentBackendCatalog();
  const selected = useAgentBackendStore(state => state.draftBackend);
  const choose = useAgentBackendStore(state => state.selectDraftBackend);
  if (isVSCode || catalog?.backends.every(backend => backend.id === 'opencode' || !backend.available)) return null;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" disabled={!catalog} aria-label={t('chat.backend.label')} title={error ?? t('chat.backend.label')}>{selected === 'antigravity' ? 'Antigravity' : 'OpenCode'}</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {catalog?.backends.filter(backend => backend.available).map(backend => <DropdownMenuItem key={backend.id} onSelect={() => choose(backend.id)} aria-selected={selected === backend.id}>{backend.label}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
