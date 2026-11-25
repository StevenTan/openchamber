import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { readOpenCodeCredentials } = vi.hoisted(() => ({ readOpenCodeCredentials: vi.fn(async () => ({})) }));
vi.mock('../../opencode/auth.js', () => ({ readOpenCodeCredentials }));

import * as google from './google/index.js';
import { resetClaudeQuotaCache } from './claude/index.js';
import { configureClaudeCredentialEnvironment } from './claude/auth.js';
import { fetchQuotaForProvider, listConfiguredQuotaProviders } from './index.js';
import { mutateQuotaConfiguration } from '../configurations.js';
import { configureAntigravityQuotaReader } from './antigravity/index.js';

describe('quota provider registry', () => {
  afterEach(() => {
    configureAntigravityQuotaReader(undefined);
    resetClaudeQuotaCache();
    configureClaudeCredentialEnvironment(() => process.env);
    vi.unstubAllGlobals();
  });

  it('includes the native Antigravity account in configured quota reads', async () => {
    configureAntigravityQuotaReader(async () => ({ groups: [{ displayName: 'Gemini Models', buckets: [{ window: 'weekly', remainingFraction: 0.93 }] }] }));
    const { configuration } = mutateQuotaConfiguration('POST', undefined, { name: 'Antigravity', templateId: 'antigravity', source: 'account', providerId: null });
    expect(await listConfiguredQuotaProviders()).toContain(configuration.id);
    expect(await fetchQuotaForProvider(configuration.id)).toMatchObject({ ok: true, usage: { models: { 'Gemini Models': { windows: { weekly: { usedPercent: 7 } } } } } });
  });

  it('does not coalesce Claude reads across a home change, including an unavailable home', async () => {
    const home = mkdtempSync(join(tmpdir(), 'claude-quota-home-'));
    let selectedHome = home;
    writeFileSync(join(home, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-old-account' } }));
    configureClaudeCredentialEnvironment(() => ({ CLAUDE_CONFIG_DIR: selectedHome }));
    let release;
    const network = vi.fn().mockReturnValue(new Promise(resolve => { release = resolve; }));
    vi.stubGlobal('fetch', network);
    try {
      const { configuration } = mutateQuotaConfiguration('POST', undefined, { name: 'Claude', templateId: 'claude', source: 'account', providerId: null });
      const oldRequest = fetchQuotaForProvider(configuration.id);
      await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1));
      selectedHome = join(home, 'unavailable');
      const selectedRequest = fetchQuotaForProvider(configuration.id);
      release({ ok: true, status: 200, headers: new Headers(), json: async () => ({ limits: [{ kind: 'session', percent: 12 }] }) });
      const [oldResult, selectedResult] = await Promise.all([oldRequest, selectedRequest]);
      expect(selectedResult).toMatchObject({ ok: false, configured: true, usage: null });
      expect(oldResult.ok).toBe(false);
      expect(await listConfiguredQuotaProviders()).toContain(configuration.id);
      expect(network).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('answers a Claude read whose OpenCode credential lookup rejects with the failure envelope', async () => {
    const home = mkdtempSync(join(tmpdir(), 'claude-quota-no-local-'));
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
    vi.stubEnv('HOME', home);
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', '');
    configureClaudeCredentialEnvironment(() => ({}));
    readOpenCodeCredentials.mockRejectedValueOnce(new Error('OpenCode is unreachable'));
    try {
      const { configuration } = mutateQuotaConfiguration('POST', undefined, { name: 'Claude', templateId: 'claude', source: 'account', providerId: null });
      await expect(fetchQuotaForProvider(configuration.id)).resolves.toMatchObject({
        providerId: configuration.id, ok: false, configured: true, usage: null, error: 'OpenCode is unreachable',
      });
    } finally {
      if (platform) Object.defineProperty(process, 'platform', platform);
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('exposes google provider configuration helpers through the provider module', () => {
    expect(google.providerId).toBe('google');
    expect(google.providerName).toBe('Google');
    expect(typeof google.isConfigured).toBe('function');
    expect(typeof google.resolveGoogleAuthSources).toBe('function');
  });

  it('lists ZenMux from its managed credential, whatever the OpenCode auth holds', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'quota-list-'));
    vi.stubEnv('OPENCHAMBER_DATA_DIR', dataDir);
    try {
      const { configuration } = mutateQuotaConfiguration('POST', undefined, { name: 'ZenMux', templateId: 'zenmux', source: 'account', providerId: null });
      await expect(listConfiguredQuotaProviders()).resolves.not.toContain(configuration.id);
      mkdirSync(join(dataDir, 'quota'), { recursive: true });
      writeFileSync(join(dataDir, 'quota', 'zenmux.json'), JSON.stringify({ platformApiKey: 'key' }));
      await expect(listConfiguredQuotaProviders()).resolves.toContain(configuration.id);
    } finally {
      vi.unstubAllEnvs();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('coalesces concurrent refreshes by provider ID', async () => {
    const first = fetchQuotaForProvider('unsupported-test-provider');
    const second = fetchQuotaForProvider('unsupported-test-provider');

    expect(first).toBe(second);
    await first;
    expect(fetchQuotaForProvider('unsupported-test-provider')).not.toBe(first);
  });

  it.each(['constructor', 'toString', '__proto__', 'null', null])('rejects unsupported registry key %s', async (providerId) => {
    await expect(fetchQuotaForProvider(providerId)).resolves.toMatchObject({
      providerId,
      providerName: providerId,
      ok: false,
      configured: false,
      usage: null,
      error: 'Unsupported provider',
    });
  });
});
