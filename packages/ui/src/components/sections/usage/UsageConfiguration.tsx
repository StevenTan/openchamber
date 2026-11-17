import React from 'react';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { SettingsStackedField, SettingsTwoColumn, SettingsSection, SETTINGS_SELECT_TRIGGER_CLASS, SETTINGS_ICON_BUTTON_CLASS } from '../shared/SettingsSection';
import { SettingsPageLayout } from '../shared/SettingsPageLayout';
import { useI18n } from '@/lib/i18n';
import { useConfigStore } from '@/stores/useConfigStore';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { QUOTA_PROVIDERS } from '@/lib/quota';
import { Icon } from '@/components/icon/Icon';
import type { QuotaConfiguration, QuotaConfigurationInput } from '@/lib/quota/configurations';

const UsageConfigurationFields: React.FC<{
  value: QuotaConfigurationInput;
  disabled: boolean;
  templateEditable?: boolean;
  onChange: (changes: Partial<QuotaConfigurationInput>) => void;
  onNameCommit?: () => void;
}> = ({ value, disabled, templateEditable = false, onChange, onNameCommit }) => {
  const { t } = useI18n();
  const providers = useConfigStore(state => state.providers);
  const capabilities = useQuotaStore(state => state.providerResponseTemplates);
  const providerName = providers.find(provider => provider.id === value.providerId)?.name || value.providerId;
  return <SettingsTwoColumn className="max-w-[24rem] gap-4 @sm:grid-cols-2 @3xl:gap-4">
    <SettingsStackedField label={t('settings.usage.configuration.name')} className="min-w-0 @sm:col-span-2">
      <Input aria-label={t('settings.usage.configuration.name')} className="w-full" value={value.name} disabled={disabled} onChange={event => onChange({ name: event.target.value })} onBlur={onNameCommit} onKeyDown={event => { if (event.key === 'Enter' && onNameCommit) event.currentTarget.blur(); }} />
    </SettingsStackedField>
    {templateEditable && <SettingsStackedField label={t('settings.usage.configuration.template')} className="min-w-0">
      <Select value={value.templateId} disabled={disabled} disableGlobalShortcuts onValueChange={id => {
        const template = QUOTA_PROVIDERS.find(entry => entry.id === id);
        if (!template) return;
        const source = capabilities.includes(id) ? 'provider' : 'account';
        const changes: Partial<QuotaConfigurationInput> = { templateId: template.id, source, providerId: source === 'provider' ? value.providerId : null };
        if (value.name === QUOTA_PROVIDERS.find(entry => entry.id === value.templateId)?.name) changes.name = template.name;
        onChange(changes);
      }}>
        <SelectTrigger className={`${SETTINGS_SELECT_TRIGGER_CLASS} max-w-full`} aria-label={t('settings.usage.configuration.template')}><SelectValue>{QUOTA_PROVIDERS.find(entry => entry.id === value.templateId)?.name}</SelectValue></SelectTrigger>
        <SelectContent>{QUOTA_PROVIDERS.map(template => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
      </Select>
    </SettingsStackedField>}
    <SettingsStackedField label={t('settings.usage.configuration.provider')} className={templateEditable ? 'min-w-0' : 'min-w-0 @sm:col-span-2'} info={value.source === 'account' ? t('settings.usage.configuration.accountHint') : undefined}>
      <Select value={value.source === 'account' ? 'account' : value.providerId ? `provider:${value.providerId}` : ''} disabled={disabled} disableGlobalShortcuts onValueChange={id => onChange(id === 'account' ? { source: 'account', providerId: null } : { source: 'provider', providerId: id.slice('provider:'.length) })}>
        <SelectTrigger className={`${SETTINGS_SELECT_TRIGGER_CLASS} max-w-full`} aria-label={t('settings.usage.configuration.provider')}><SelectValue>{value.source === 'account' ? t('settings.usage.configuration.account') : providerName ?? t('settings.usage.configuration.chooseProvider')}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value="account">{t('settings.usage.configuration.account')}</SelectItem>
          {providers.map(provider => <SelectItem key={provider.id} value={`provider:${provider.id}`} disabled={!capabilities.includes(value.templateId)}>{provider.name || provider.id}</SelectItem>)}
          {value.providerId && !providers.some(provider => provider.id === value.providerId) && <SelectItem value={`provider:${value.providerId}`}>{value.providerId}</SelectItem>}
        </SelectContent>
      </Select>
    </SettingsStackedField>
  </SettingsTwoColumn>;
};

export const NewUsageConfiguration: React.FC = () => {
  const { t } = useI18n();
  const capabilities = useQuotaStore(state => state.providerResponseTemplates);
  const saveConfiguration = useQuotaStore(state => state.saveConfiguration);
  const selectedProviderId = useQuotaStore(state => state.selectedProviderId);
  const setSelectedProvider = useQuotaStore(state => state.setSelectedProvider);
  const [value, setValue] = React.useState<QuotaConfigurationInput>(() => ({ name: 'Codex', templateId: 'codex', source: capabilities.includes('codex') ? 'provider' : 'account', providerId: null }));
  const [busy, setBusy] = React.useState(false);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const id = await saveConfiguration({ ...value, name: value.name.trim() });
      if (id) setSelectedProvider(id);
    } catch { toast.error(t('settings.usage.configuration.saveFailed')); }
    finally { setBusy(false); }
  };
  return <SettingsPageLayout title={t('settings.usage.configuration.add')}>
    <form onSubmit={event => void create(event)}>
      <SettingsSection>
        <UsageConfigurationFields value={value} disabled={busy} templateEditable onChange={changes => setValue(current => ({ ...current, ...changes }))} />
        <div className="flex gap-2 pt-3">
          <Button type="submit" size="sm" disabled={busy || !value.name.trim() || (value.source === 'provider' && value.providerId === null)}>{t('settings.common.actions.create')}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setSelectedProvider(selectedProviderId)}>{t('dialog.common.actions.cancel')}</Button>
        </div>
      </SettingsSection>
    </form>
  </SettingsPageLayout>;
};

export const UsageConfiguration: React.FC<{ configuration: QuotaConfiguration }> = ({ configuration }) => {
  const { t } = useI18n();
  const saveConfiguration = useQuotaStore(state => state.saveConfiguration);
  const [name, setName] = React.useState(configuration.name);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setName(configuration.name), [configuration.name]);

  const save = async (changes: Partial<QuotaConfigurationInput>) => {
    setBusy(true);
    try { await saveConfiguration({ ...configuration, ...changes }, configuration.id); }
    catch { setName(configuration.name); toast.error(t('settings.usage.configuration.saveFailed')); }
    finally { setBusy(false); }
  };
  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) { setName(configuration.name); return; }
    if (trimmed !== configuration.name) void save({ name: trimmed });
  };
  return <UsageConfigurationFields value={{ ...configuration, name }} disabled={busy} onNameCommit={saveName} onChange={changes => {
      if (changes.source || 'providerId' in changes) void save({ name: name.trim() || configuration.name, ...changes });
      else if (changes.name !== undefined) setName(changes.name);
    }} />;
};

export const DeleteUsageConfiguration: React.FC<{ configuration: QuotaConfiguration }> = ({ configuration }) => {
  const { t } = useI18n();
  const remove = useQuotaStore(state => state.deleteConfiguration);
  const { confirm, dialog } = useConfirmDialog();
  const [busy, setBusy] = React.useState(false);
  const deleteEntry = async () => {
    if (!await confirm({ title: t('settings.common.actions.delete'), message: t('settings.usage.configuration.deleteConfirm', { name: configuration.name }), action: t('settings.common.actions.delete'), destructive: true })) return;
    setBusy(true);
    try { await remove(configuration.id); }
    catch { toast.error(t('settings.usage.configuration.saveFailed')); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="ghost" size="sm" className={SETTINGS_ICON_BUTTON_CLASS} aria-label={t('settings.common.actions.delete')} title={t('settings.common.actions.delete')} disabled={busy} onClick={() => void deleteEntry()}><Icon name="delete-bin" className="size-4" /></Button>
    {dialog}
  </>;
};
