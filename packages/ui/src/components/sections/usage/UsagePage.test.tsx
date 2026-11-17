import { afterAll, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { QuotaConfiguration } from '@/lib/quota/configurations';

const quota = await import('@/stores/useQuotaStore');
const i18n = await import('@/lib/i18n');
mock.module('@/lib/i18n', () => ({ ...i18n, useI18n: () => ({ t: (key: string) => key }) }));
const dom = new Window({ url: 'http://127.0.0.1/' });
Object.assign(globalThis, { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, CustomEvent: dom.CustomEvent, localStorage: dom.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
mock.module('@/stores/useQuotaStore', () => ({ ...quota, useQuotaAutoRefresh: () => {} }));
mock.module('./UsageConfiguration', () => ({
  UsageConfiguration: ({ configuration }: { configuration: QuotaConfiguration }) => <input aria-label="Configuration name" readOnly value={configuration.name} />,
  NewUsageConfiguration: () => <div>New usage</div>,
  DeleteUsageConfiguration: () => null,
}));
mock.module('./QuotaCredentials', () => ({ QuotaCredentials: ({ providerId }: { providerId: string }) => <input aria-label="Credential provider" readOnly value={providerId} /> }));
mock.module('./UsageCard', () => ({ UsageCard: () => null }));
mock.module('./ClaudeCodeSignIn', () => ({ ClaudeCodeSignIn: () => null }));
mock.module('./ConsoleBudgetsSection', () => ({ ConsoleBudgetsSection: () => null }));
mock.module('@/components/usage/QuotaProviderLogo', () => ({ QuotaProviderLogo: () => null }));
mock.module('@/components/icon/Icon', () => ({ Icon: () => null }));
mock.module('@/components/ui/confirm-dialog', () => ({ useConfirmDialog: () => ({ confirm: async () => false, dialog: null }) }));
mock.module('@/components/sections/shared/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ title, children, headerEnd }: { title?: React.ReactNode; children: React.ReactNode; headerEnd?: React.ReactNode }) => <main><h1>{title}</h1>{headerEnd}{children}</main>,
}));
mock.module('@/components/sections/shared/SettingsSection', () => ({
  SettingsSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SettingsCheckboxRow: () => <input type="checkbox" readOnly />,
}));
const { UsagePage } = await import('./UsagePage');
const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
afterAll(async () => { await act(() => root.unmount()); await dom.happyDOM.close(); });

test('the visible form and credentials follow the selected usage entry', async () => {
  const configurations: QuotaConfiguration[] = [
    { id: 'cursor', name: 'Cursor', templateId: 'cursor', source: 'account', providerId: null, revision: 'cursor' },
    { id: 'codex', name: 'Codex', templateId: 'codex', source: 'provider', providerId: 'test-provider', revision: 'codex' },
    { id: 'github-copilot', name: 'Copilot', templateId: 'github-copilot', source: 'account', providerId: null, revision: 'copilot' },
  ];
  quota.useQuotaStore.setState({ configurations, selectedProviderId: 'cursor', isCreatingConfiguration: false,
    results: configurations.map(entry => ({ providerId: entry.id, providerName: entry.name, configured: true, ok: true, usage: { windows: {} }, fetchedAt: 1 })),
  });
  await act(() => root.render(<UsagePage />));
  for (const id of ['codex', 'github-copilot', 'cursor', 'codex'] as const) {
    await act(() => quota.useQuotaStore.getState().setSelectedProvider(id));
    const names = container.querySelectorAll<HTMLInputElement>('[aria-label="Configuration name"]');
    expect(names.length).toBe(1);
    expect(names[0].value).toBe(configurations.find(entry => entry.id === id)?.name);
    expect(container.querySelectorAll('[aria-label="Credential provider"]').length).toBe(id === 'cursor' ? 1 : 0);
  }
});
