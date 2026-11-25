import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SettingsSection, SettingsFieldRow } from '../shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { useAntigravitySettings } from '@/hooks/useAntigravitySettings';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { openExternalUrl } from '@/lib/url';
import { copyTextToClipboard } from '@/lib/clipboard';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export function AgentBackendSettings() {
  const { t } = useI18n();
  const { binary, setBinary, busy, save, login, installed, install, authentication, authenticating, code, setCode, submit, cancel, logout } = useAntigravitySettings();
  const enterpriseMode = useEnterpriseMode();
  const { confirm, dialog } = useConfirmDialog();
  if (enterpriseMode) return null;
  return (
    <SettingsSection title={t('settings.backends.title')}>
      <SettingsFieldRow label={t('settings.backends.binary')} settingsItem="general.antigravity-binary">
        <Input value={binary} disabled={busy || authenticating} onChange={event => setBinary(event.target.value)} onBlur={() => void save()} className="h-8 max-w-[24rem] font-mono" aria-label={t('settings.backends.binary')} />
      </SettingsFieldRow>
      <SettingsFieldRow label="Antigravity" settingsItem="general.antigravity-login">
        <div className="flex max-w-[24rem] flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {installed
              ? <Button variant="outline" size="sm" disabled={busy || authenticating} onClick={() => void login()}>{t('settings.backends.login')}</Button>
              : <Button variant="outline" size="sm" disabled={busy} onClick={() => void install()}>{busy ? t('common.loading') : t('settings.backends.install')}</Button>}
            {authenticating && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void cancel()}>{t('settings.common.actions.cancel')}</Button>}
            {authentication.phase === 'succeeded' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
              void confirm({ title: t('settings.backends.signOut'), message: t('settings.backends.signOutMessage'), action: t('settings.backends.signOut') }).then(accepted => { if (accepted) void logout(); });
            }}>{t('settings.backends.signOut')}</Button>}
          </div>
          <div role="status" className="typography-meta text-muted-foreground">
            {authentication.phase === 'starting' && t('settings.providers.page.auth.oauth.starting')}
            {authentication.phase === 'waiting' && t('settings.providers.page.auth.oauth.codeHint')}
            {authentication.phase === 'verifying' && t('settings.backends.verifying')}
            {authentication.phase === 'succeeded' && t('settings.backends.signedIn')}
          </div>
          {authentication.phase === 'waiting' && <>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void openExternalUrl(authentication.authorizationUrl)}>{t('settings.providers.page.actions.open')}</Button>
              <Button variant="ghost" size="sm" onClick={() => void copyTextToClipboard(authentication.authorizationUrl)}>{t('settings.mcp.page.actions.copyLink')}</Button>
            </div>
            <form className="flex w-full gap-2" onSubmit={event => { event.preventDefault(); void submit(); }}>
              <Input value={code} onChange={event => setCode(event.target.value)} aria-label={t('settings.providers.page.auth.pasteAuthorizationCodePlaceholder')} placeholder={t('settings.providers.page.auth.pasteAuthorizationCodePlaceholder')} autoComplete="off" />
              <Button type="submit" size="sm" disabled={busy || !code.trim()}>{t('settings.providers.page.actions.continue')}</Button>
            </form>
          </>}
          {authentication.phase === 'failed' && <p role="alert" className="typography-meta text-[var(--status-error-text)] break-words">{authentication.message}</p>}
        </div>
      </SettingsFieldRow>
      {dialog}
    </SettingsSection>
  );
}
