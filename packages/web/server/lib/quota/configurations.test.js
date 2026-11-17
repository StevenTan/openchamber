import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureQuotaResponseSupport, quotaConfigurationStatus, mutateQuotaConfiguration, readQuotaConfiguration, configurationSnapshotPath, migrateQuotaConfigurations, quotaConfigurationsNeedMigration } from './configurations.js';
import { quotaTemplates } from './templates.js';
import { materializeQuotaUsagePlugin, parseCodexUsageHeaders, fetchResponseQuota } from './response-usage.js';
import { registerQuotaRoutes } from './routes.js';

let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-configurations-'));
  vi.stubEnv('OPENCHAMBER_DATA_DIR', directory);
  configureQuotaResponseSupport(() => true);
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  configureQuotaResponseSupport(() => false);
  fs.rmSync(directory, { recursive: true, force: true });
});
const fields = (overrides = {}) => ({ name: 'Personal', templateId: 'codex', source: 'provider', providerId: 'proxy-a', ...overrides });
const create = (input = fields()) => mutateQuotaConfiguration('POST', undefined, input).configuration;
const update = (configuration, changes) => mutateQuotaConfiguration('PUT', configuration.id, { ...configuration, ...changes }).configuration;
const headers = (used = 23) => new Headers({
  'x-codex-primary-used-percent': String(used), 'x-codex-primary-window-minutes': '300', 'x-codex-primary-reset-after-seconds': '3600',
  'x-codex-secondary-used-percent': '44', 'x-codex-secondary-window-minutes': '10080', 'x-codex-secondary-reset-at': '2000000000',
});
const pluginHooks = async () => {
  const target = await materializeQuotaUsagePlugin({ fsPromises: fs.promises, instanceDir: directory });
  const { default: plugin } = await import(`${pathToFileURL(path.join(target, 'index.js'))}?test=${directory}`);
  const hooks = new Map();
  await plugin.setup({ session: { hook: async (name, callback) => { hooks.set(name, callback); } } });
  return hooks;
};
const event = (providerID, used = 23) => ({ model: { providerID }, request: new Request('http://127.0.0.1/v1/responses'), response: new Response('stream body', { headers: headers(used) }) });
const exchange = async (hooks, providerID, used) => {
  const exchange = event(providerID, used);
  await hooks.get('http.request')(exchange); await hooks.get('http.response')(exchange);
  return exchange;
};

describe('usage configurations', () => {
  it('starts with an empty catalog while templates remain available for creation', () => {
    expect(quotaConfigurationStatus().configurations).toEqual([]);
    expect(quotaTemplates.length).toBeGreaterThan(10);
    const configuration = create();
    expect(quotaConfigurationStatus().configurations).toEqual([configuration]);
    mutateQuotaConfiguration('DELETE', configuration.id);
    expect(quotaConfigurationStatus().configurations).toEqual([]);
  });

  it('migrates configured accounts and edited entries while preserving their identities', () => {
    const defaults = quotaTemplates.map(template => ({ id: template.id, name: template.name, templateId: template.id, source: 'account', providerId: null, revision: randomUUID() }));
    const configured = defaults.find(entry => entry.id === 'claude');
    const bound = { ...defaults.find(entry => entry.id === 'codex'), source: 'provider', providerId: 'proxy-a' };
    const renamed = { ...defaults.find(entry => entry.id === 'cursor'), name: 'Personal Cursor' };
    const custom = { ...bound, id: `quota-${randomUUID()}`, name: 'Work' };
    const entries = defaults.map(entry => entry.id === 'codex' ? bound : entry.id === 'cursor' ? renamed : entry);
    fs.mkdirSync(path.join(directory, 'quota/snapshots'), { recursive: true });
    const target = path.join(directory, 'quota/configurations.json');
    fs.writeFileSync(target, JSON.stringify({ version: 1, catalogRevision: 7, configurations: [...entries, custom] }));
    fs.writeFileSync(configurationSnapshotPath(bound.id), 'saved observation');
    expect(quotaConfigurationsNeedMigration()).toBe(true);
    migrateQuotaConfigurations(['claude']);
    const status = quotaConfigurationStatus();
    expect(status.configurations).toEqual(entries.filter(entry => ['claude', 'codex', 'cursor'].includes(entry.id)).concat(custom));
    expect(readQuotaConfiguration('claude')).toEqual(configured);
    expect(fs.readFileSync(configurationSnapshotPath(bound.id), 'utf8')).toBe('saved observation');
    expect(status.catalogRevision).toBe(8);
    expect(JSON.parse(fs.readFileSync(target, 'utf8')).version).toBe(2);
    migrateQuotaConfigurations([]);
    expect(quotaConfigurationStatus()).toEqual(status);
  });

  it('leaves a pending migration intact when credentials or persistence are unavailable', async () => {
    const entry = { id: 'claude', name: 'Claude', templateId: 'claude', source: 'account', providerId: null, revision: randomUUID() };
    fs.mkdirSync(path.join(directory, 'quota'));
    const target = path.join(directory, 'quota/configurations.json');
    const original = JSON.stringify({ version: 1, catalogRevision: 3, configurations: [entry] });
    fs.writeFileSync(target, original);
    const app = express();
    registerQuotaRoutes(app, { getQuotaProviders: async () => ({ initializeQuotaConfigurations: async () => { throw new Error('Credentials unavailable'); } }) });
    await request(app).get('/api/quota/configurations').expect(500);
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('Read only'); });
    expect(() => migrateQuotaConfigurations([])).toThrow('Read only');
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
  });

  it('creates entries with one provider and keeps an authoritative empty list', () => {
    const initial = quotaConfigurationStatus().configurations;
    const copy = create(fields({ apiKey: 'must-not-store', providerId: 'proxy-a' }));
    expect(copy.providerId).toBe('proxy-a');
    expect(copy.id).not.toBe('codex');
    expect(fs.readFileSync(path.join(directory, 'quota/configurations.json'), 'utf8')).not.toContain('must-not-store');
    for (const configuration of [...initial, copy]) mutateQuotaConfiguration('DELETE', configuration.id);
    expect(quotaConfigurationStatus().configurations).toEqual([]);
  });

  it('preserves the sample revision on rename and changes it with the source', () => {
    const configuration = create();
    const renamed = update(configuration, { name: 'Work' });
    expect(renamed.revision).toBe(configuration.revision);
    expect(update(renamed, { providerId: 'other' }).revision).not.toBe(configuration.revision);
    const changed = update(renamed, { templateId: 'claude', source: 'account', providerId: null });
    expect(changed.templateId).toBe('claude');
    expect(changed.revision).not.toBe(configuration.revision);
  });

  it('migrates the saved Codex binding and observed usage together', () => {
    fs.mkdirSync(path.join(directory, 'quota'));
    const revision = randomUUID();
    fs.writeFileSync(path.join(directory, 'quota/codex-source.json'), JSON.stringify({ mode: 'provider', providerId: 'proxy', revision }));
    fs.writeFileSync(path.join(directory, 'quota/codex-snapshot.json'), JSON.stringify({ revision, observedAt: 123, rate_limit: parseCodexUsageHeaders(headers()) }));
    const configuration = quotaConfigurationStatus().configurations.find(entry => entry.id === 'codex');
    expect(configuration).toMatchObject({ source: 'provider', providerId: 'proxy', revision });
    expect(fetchResponseQuota(configuration)).toMatchObject({ ok: true, fetchedAt: 123 });
  });

  it('leaves the catalog intact when a configuration write fails', () => {
    const configuration = create();
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('Read only'); });
    expect(() => update(configuration, { name: 'New name' })).toThrow('Read only');
    expect(readQuotaConfiguration(configuration.id).name).toBe('Personal');
  });

  it('keeps provider responses unavailable on unsupported templates and runtimes', () => {
    expect(() => create(fields({ templateId: 'claude' }))).toThrow('unavailable');
    configureQuotaResponseSupport(() => false);
    expect(() => create()).toThrow('unavailable');
    expect(create(fields({ source: 'account' }))).toMatchObject({ source: 'account' });
  });

  it('exposes create, update and delete routes with catalog change events', async () => {
    const app = express(); const emitChanged = vi.fn();
    registerQuotaRoutes(app, { getQuotaProviders: async () => ({}), supportsCodexProviderBinding: () => true, emitChanged });
    const added = await request(app).post('/api/quota/configurations').send(fields()).expect(200);
    const configuration = added.body.configuration;
    const renamed = await request(app).put(`/api/quota/configurations/${configuration.id}`).send({ ...configuration, name: 'Office' }).expect(200);
    expect(renamed.body.configuration.name).toBe('Office');
    await request(app).delete(`/api/quota/configurations/${configuration.id}`).expect(200);
    await request(app).put(`/api/quota/configurations/${configuration.id}`).send(fields()).expect(404);
    expect(emitChanged).toHaveBeenCalledTimes(3);
    await request(app).post('/api/quota/configurations').send(fields({ templateId: 'unknown' })).expect(400);
  });

  it('reports an unreadable saved catalog as a server failure', async () => {
    create();
    fs.writeFileSync(path.join(directory, 'quota/configurations.json'), '{invalid');
    const app = express();
    registerQuotaRoutes(app, { getQuotaProviders: async () => ({}) });
    await request(app).get('/api/quota/configurations').expect(500);
    await request(app).post('/api/quota/configurations').send(fields({ source: 'account' })).expect(500);
  });
});

describe('provider response observations', () => {
  it('records the selected provider for each configuration without consuming the response', async () => {
    const a = create(); const b = create(fields({ name: 'Shared', providerId: 'proxy-b' })); const c = create(fields({ name: 'Other', providerId: 'proxy-c' }));
    const hooks = await pluginHooks();
    const first = await exchange(hooks, 'proxy-a');
    expect(await first.response.text()).toBe('stream body');
    expect(fetchResponseQuota(a).usage.windows['5h'].usedPercent).toBe(23);
    expect(fetchResponseQuota(b).usage.windows).toEqual({});
    await exchange(hooks, 'proxy-b', 31);
    expect(fetchResponseQuota(a).usage.windows['5h'].usedPercent).toBe(23);
    expect(fetchResponseQuota(b).usage.windows.weekly.usedPercent).toBe(44);
    expect(fetchResponseQuota(c).usage.windows).toEqual({});
  });

  it('discards responses after a binding change or deletion', async () => {
    const configuration = create(); const hooks = await pluginHooks(); const pending = event('proxy-a');
    await hooks.get('http.request')(pending);
    const changed = update(configuration, { providerId: 'other' });
    await hooks.get('http.response')(pending);
    expect(fetchResponseQuota(changed).usage.windows).toEqual({});
    const deleted = event('other'); await hooks.get('http.request')(deleted);
    mutateQuotaConfiguration('DELETE', configuration.id);
    await hooks.get('http.response')(deleted);
    expect(fs.existsSync(configurationSnapshotPath(configuration.id))).toBe(false);
  });

  it('keeps sample identity on rename and reports malformed snapshots as failures', async () => {
    const configuration = create(); const hooks = await pluginHooks(); await exchange(hooks, 'proxy-a');
    const renamed = update(configuration, { name: 'Renamed' });
    expect(fetchResponseQuota(renamed)).toMatchObject({ providerName: 'Renamed', ok: true });
    fs.writeFileSync(configurationSnapshotPath(configuration.id), '{}');
    expect(() => fetchResponseQuota(renamed)).toThrow();
  });

  it('uses absolute data paths when OpenCode runs in another directory', async () => {
    vi.stubEnv('OPENCHAMBER_DATA_DIR', path.relative(process.cwd(), directory));
    const configuration = create();
    const plugin = await materializeQuotaUsagePlugin({ fsPromises: fs.promises, instanceDir: directory });
    const script = `import plugin from ${JSON.stringify(pathToFileURL(path.join(plugin, 'index.js')).href)}; const hooks=new Map(); await plugin.setup({session:{hook:async(n,f)=>hooks.set(n,f)}}); const event={model:{providerID:'proxy-a'},request:new Request('http://127.0.0.1'),response:new Response('',{headers:${JSON.stringify(Object.fromEntries(headers()))}})}; await hooks.get('http.request')(event); await hooks.get('http.response')(event);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: os.tmpdir(), encoding: 'utf8' });
    expect(child.stderr).toBe(''); expect(child.status).toBe(0);
    expect(fetchResponseQuota(configuration).usage.windows['5h'].usedPercent).toBe(23);
  });

  it('accepts a weekly-only primary window and ignores malformed headers', () => {
    const weekly = parseCodexUsageHeaders(new Headers({ 'x-codex-primary-used-percent': '86', 'x-codex-primary-window-minutes': '10080' }));
    expect(weekly.primary_window.limit_window_seconds).toBe(604800);
    expect(parseCodexUsageHeaders(new Headers({ 'x-codex-primary-used-percent': 'NaN', 'x-codex-primary-window-minutes': '300' }))).toBeNull();
  });
});
