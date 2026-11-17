import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../opencode/auth.js', () => ({ readOpenCodeCredentials: async () => ({}) }));

import * as google from './google/index.js';
import { fetchQuotaForProvider, listConfiguredQuotaProviders, initializeQuotaConfigurations } from './index.js';
import { mutateQuotaConfiguration } from '../configurations.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

describe('quota provider registry', () => {
  it('retains a pending catalog when a managed credential cannot be read', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'quota-migration-'));
    vi.stubEnv('OPENCHAMBER_DATA_DIR', dataDir);
    try {
      mkdirSync(join(dataDir, 'quota'));
      const original = JSON.stringify({ version: 1, catalogRevision: 1, configurations: [{ id: 'exe-dev', name: 'exe.dev', templateId: 'exe-dev', source: 'account', providerId: null, revision: randomUUID() }] });
      writeFileSync(join(dataDir, 'quota/configurations.json'), original);
      writeFileSync(join(dataDir, 'quota/exe-dev.json'), '{invalid');
      await expect(initializeQuotaConfigurations()).rejects.toThrow('Could not read exe-dev quota credentials');
      expect(readFileSync(join(dataDir, 'quota/configurations.json'), 'utf8')).toBe(original);
    } finally {
      vi.unstubAllEnvs();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('exposes google provider configuration helpers through the provider module', () => {
    expect(google.providerId).toBe('google');
    expect(google.providerName).toBe('Google');
    expect(typeof google.isConfigured).toBe('function');
    expect(typeof google.resolveGoogleAuthSources).toBe('function');
  });

  it('can list configured providers without missing provider exports', async () => {
    await expect(listConfiguredQuotaProviders()).resolves.toBeInstanceOf(Array);
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
});
