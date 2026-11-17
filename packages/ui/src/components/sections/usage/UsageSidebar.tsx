import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { QuotaProviderLogo } from '@/components/usage/QuotaProviderLogo';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { resolveUsageTone } from '@/lib/quota';
import { useQuotaAutoRefresh, useQuotaProviders, useQuotaStore } from '@/stores/useQuotaStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { useI18n } from '@/lib/i18n';
import { SETTINGS_SECTION_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';

interface UsageSidebarProps {
  onItemSelect?: () => void;
}

const getUsagePercent = (usage: { windows?: Record<string, { usedPercent: number | null }> } | null | undefined) => {
  const windows = usage?.windows ?? {};
  const values = Object.values(windows)
    .map((window) => window.usedPercent)
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
};

export const UsageSidebar: React.FC<UsageSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
  const results = useQuotaStore((state) => state.results);
  const selectedProviderId = useQuotaStore((state) => state.selectedProviderId);
  const setSelectedProvider = useQuotaStore((state) => state.setSelectedProvider);
  const usageDisplayMode = useQuotaStore((state) => state.displayMode);
  const setUsageDisplayMode = useQuotaStore((state) => state.setDisplayMode);
  const providers = useQuotaProviders();
  const configuredProviderIds = new Set(results.filter(result => result.configured).map(result => result.providerId));
  const sortedProviders = [...providers].sort((a, b) => Number(configuredProviderIds.has(b.id)) - Number(configuredProviderIds.has(a.id)));
  const startConfiguration = useQuotaStore(state => state.startConfiguration);
  const isCreatingConfiguration = useQuotaStore(state => state.isCreatingConfiguration);
  const configurations = useQuotaStore(state => state.configurations);
  const configurationLoadFailed = useQuotaStore(state => state.configurationLoadFailed);
  useQuotaAutoRefresh(true, true);

  const persistUsageSettings = React.useCallback(async (changes: { usageDisplayMode?: 'usage' | 'remaining'; usageDropdownProviders?: string[] }) => {
    try {
      await updateDesktopSettings(changes);
    } catch (error) {
      console.warn('Failed to save usage settings:', error);
    }
  }, []);

  const handleUsageDisplayModeChange = React.useCallback((value: string) => {
    if (value !== 'usage' && value !== 'remaining') {
      return;
    }
    setUsageDisplayMode(value);
    void persistUsageSettings({ usageDisplayMode: value });
  }, [persistUsageSettings, setUsageDisplayMode]);

  const bgClass = 'bg-background';

  return (
    <div className={cn('flex h-full flex-col', bgClass)}>
      <div className="border-b px-3 pt-4 pb-3">
        <h2 className={`${SETTINGS_SECTION_TITLE_CLASS} mb-3`}>{t('settings.usage.sidebar.title')}</h2>
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">{t('settings.usage.sidebar.total', { count: providers.length })}</span>
          <Button size="sm" variant="outline" disabled={configurations === null} onClick={() => { startConfiguration(); onItemSelect?.(); }}>{t('settings.usage.configuration.add')}</Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="typography-micro text-muted-foreground">{t('settings.usage.sidebar.field.display')}</span>
          <Select value={usageDisplayMode} onValueChange={handleUsageDisplayModeChange}>
            <SelectTrigger className="w-fit">
              <SelectValue>
                {usageDisplayMode === 'remaining'
                  ? t('settings.usage.sidebar.field.displayModeRemaining')
                  : t('settings.usage.sidebar.field.displayModeUsage')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usage">{t('settings.usage.sidebar.field.displayModeUsage')}</SelectItem>
              <SelectItem value="remaining">{t('settings.usage.sidebar.field.displayModeRemaining')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {configurationLoadFailed && <p role="alert" className="typography-meta text-[var(--status-error)] px-3 py-2">{t('settings.usage.configuration.loadFailed')}</p>}
      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        {sortedProviders.map((provider) => {
          const result = results.find((entry) => entry.providerId === provider.id);
          const percent = getUsagePercent(result?.usage);
          const tone = resolveUsageTone(percent);
          const isSelected = !isCreatingConfiguration && provider.id === selectedProviderId;
          const configured = result?.configured;

          const statusStyle = !configured
            ? { backgroundColor: 'var(--surface-muted-foreground)', opacity: 0.4 }
            : tone === 'critical'
              ? { backgroundColor: 'var(--status-error)' }
              : tone === 'warn'
                ? { backgroundColor: 'var(--status-warning)' }
                : { backgroundColor: 'var(--status-success)' };

          return (
            <div
              key={provider.id}
              className={cn(
                'group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200',
                isSelected ? 'bg-interactive-selection' : 'hover:bg-interactive-hover'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedProvider(provider.id);
                  onItemSelect?.();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={statusStyle} />
                <QuotaProviderLogo providerId={provider.id} className="h-4 w-4 flex-shrink-0" />
                <span className="typography-ui-label font-normal truncate flex-1 min-w-0 text-foreground">
                  {provider.name}
                </span>
              {configured === false && (
                <span className="typography-micro text-muted-foreground flex-shrink-0">{t('settings.usage.sidebar.status.notSet')}</span>
              )}
            </button>
          </div>
          );
        })}
      </ScrollableOverlay>
    </div>
  );
};
