import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { useIsVSCodeRuntime } from '@/hooks/useRuntimeAPIs';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useConversationBackend } from '@/hooks/useConversationBackend';
import React from 'react';
import { ModelPickerList, type ModelPickerEntry } from '@/components/model-picker/ModelPickerList';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { Tooltip, TooltipContent } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
import { usePopupSideOnOpen } from '@/components/ui/popup-side';
import { useWidthMorph } from '@/lib/motion/useSizeMorph';
import { ModelControlsLayout, ModelPickerLabel, ModelSelectorMenu, MobileModelTrigger, ThinkingSelector } from './ModelControlsView';
import { useModelControlsAppearance, useModelPickerLabels } from './useModelControlsAppearance';

export function ConversationBackendPicker() {
  const { t } = useI18n();
  const selection = useConversationBackend();
  const isVSCode = useIsVSCodeRuntime();
  const enterprise = useEnterpriseMode();
  if (selection.sessionId || isVSCode || enterprise) return null;
  return <Select value={selection.backendID} onValueChange={backendID => useSessionUIStore.setState(state => ({ newSessionDraft: { ...state.newSessionDraft, backendID } }))}>
    <SelectTrigger aria-label={t('settings.backends.backend')} className="h-7 w-auto gap-1 border-0 bg-transparent px-1.5 shadow-none typography-meta"><SelectValue>{selection.backendID === 'antigravity' ? 'Antigravity' : 'OpenCode'}</SelectValue></SelectTrigger>
    <SelectContent><SelectItem value="opencode">OpenCode</SelectItem><SelectItem value="antigravity">Antigravity</SelectItem></SelectContent>
  </Select>;
}

export function NativeConversationModelControls({ className }: { className?: string }) {
  const { t } = useI18n();
  const { key, catalog, modelID, model, variant, error } = useConversationBackend();
  const { isMobile, controlIconSize, providerLogoSize } = useModelControlsAppearance();
  const labels = useModelPickerLabels();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const side = usePopupSideOnOpen(open, triggerRef, 'top');
  useWidthMorph(triggerRef);
  const selectModel = (entry: ModelPickerEntry) => {
    const picks = useSelectionStore.getState();
    picks.saveSessionModelSelection(key, entry.providerID, entry.modelID);
    picks.pickSessionModel(key, entry.providerID, entry.modelID);
    setOpen(false);
  };
  const selectVariant = (value: string | undefined) => useSelectionStore.getState().saveAgentModelVariantForSession(key, 'antigravity', 'antigravity', modelID, value);
  const providers = React.useMemo(() => catalog?.providers.map(provider => ({
    id: provider.id, name: provider.name,
    models: catalog.models.filter(item => item.providerID === provider.id).map(item => ({ ...item })),
  })) ?? [], [catalog]);
  const picker = <ModelPickerList
    providers={providers}
    favoriteModels={[]}
    recentModels={[]}
    searchQuery={query}
    onSearchQueryChange={setQuery}
    onSelect={selectModel}
    labels={labels}
    selectedModel={model ? { providerID: model.providerID, modelID } : null}
    maxHeightClassName="max-h-[min(400px,calc(var(--available-height)-4rem))] flex-1"
    tooltipsEnabled={open}
    onEscape={() => setOpen(false)}
  />;
  const label = model?.name ?? t('common.loading');
  const icon = model ? <ProviderLogo providerId={model.providerID} className={providerLogoSize} /> : <Spinner className={controlIconSize} />;
  const modelSelector = error ? <span role="alert" className="typography-meta text-destructive">{error}</span> : isMobile ? <>
    <MobileModelTrigger className="model-controls__model-trigger" onOpenModel={() => setOpen(true)} label={label} icon={icon} disabled={!catalog} />
    <MobileOverlayPanel open={open} onClose={() => setOpen(false)} title={t('chat.modelControls.selectModel')}>{picker}</MobileOverlayPanel>
  </> : <Tooltip delayDuration={600}>
    <ModelSelectorMenu open={Boolean(catalog) && open} onOpenChange={catalog ? setOpen : undefined} side={side} triggerRef={triggerRef} ariaLabel={t('chat.modelControls.selectModel')}
      trigger={<ModelPickerLabel label={label} icon={icon} pending={!catalog} />}>
      {picker}
    </ModelSelectorMenu>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>;
  return <ModelControlsLayout className={className} model={modelSelector}
    effort={model && model.variants.length > 0 ? <ThinkingSelector variant={variant} options={model.variants.map(item => item.id)} onSelect={selectVariant} /> : null} />;
}
