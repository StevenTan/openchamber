import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { quotaDirectory, readQuotaJson, configurationSnapshotPath, quotaResponseSupport } from './configurations.js';
import { toUsageWindow, resolveWindowLabel, buildResult } from './utils/index.js';

export function parseCodexUsageHeaders(headers, now = Date.now()) {
  const number = (name) => {
    const value = headers.get(name);
    if (value === null || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const window = (name) => {
    const prefix = `x-codex-${name}`;
    const used = number(`${prefix}-used-percent`);
    const minutes = number(`${prefix}-window-minutes`);
    if (used === null || minutes === null || minutes === 0) return null;
    const resetAt = number(`${prefix}-reset-at`);
    const resetAfter = number(`${prefix}-reset-after-seconds`);
    return {
      used_percent: used,
      limit_window_seconds: minutes * 60,
      reset_at: resetAt ?? (resetAfter === null ? null : now / 1000 + resetAfter),
    };
  };
  const primary = window('primary');
  const secondary = window('secondary');
  return primary || secondary ? { primary_window: primary, secondary_window: secondary } : null;
}

const windowSchema = z.object({ used_percent: z.number().finite().nonnegative(), limit_window_seconds: z.number().finite().positive(), reset_at: z.number().finite().nullable() });
const snapshotSchema = z.object({ revision: z.string(), observedAt: z.number().finite(), data: z.object({ rate_limit: z.object({ primary_window: windowSchema.nullable(), secondary_window: windowSchema.nullable() }) }) });

export const fetchResponseQuota = (configuration) => {
  const identity = { providerId: configuration.id, providerName: configuration.name };
  if (!quotaResponseSupport() || configuration.templateId !== 'codex') return buildResult({ ...identity, ok: false, configured: true, error: 'Provider response usage is unavailable for this template in this runtime' });
  if (configuration.providerId === null) return buildResult({ ...identity, ok: false, configured: false, error: 'Not configured' });
  const raw = readQuotaJson(configurationSnapshotPath(configuration.id));
  const snapshot = raw === null ? null : snapshotSchema.parse(raw);
  const windows = {};
  if (snapshot?.revision === configuration.revision) {
    for (const window of [snapshot.data.rate_limit.primary_window, snapshot.data.rate_limit.secondary_window]) {
      if (!window) continue;
      windows[resolveWindowLabel(window.limit_window_seconds)] = toUsageWindow({ usedPercent: window.used_percent, windowSeconds: window.limit_window_seconds, resetAt: window.reset_at === null ? null : window.reset_at * 1000 });
    }
  }
  const result = buildResult({ ...identity, ok: true, configured: true, usage: { windows } });
  return snapshot?.revision === configuration.revision ? { ...result, fetchedAt: snapshot.observedAt } : result;
};

function observeUsage(ctx, directory, io) {
  const requests = new WeakMap();
  const read = () => {
    try { return JSON.parse(io.fs.readFileSync(io.path.join(directory, 'configurations.json'), 'utf8')).configurations; }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  return Promise.all([
    ctx.session.hook('http.request', (event) => {
      try {
        const configurations = read().filter((entry) => entry.source === 'provider' && entry.providerId === event.model.providerID);
        if (configurations.length) requests.set(event.request, configurations);
      } catch { console.warn('[quota] Could not read usage configurations'); }
    }),
    ctx.session.hook('http.response', (event) => {
      const configurations = requests.get(event.request);
      if (!configurations) return;
      try {
        const rateLimit = parseCodexUsageHeaders(event.response.headers);
        if (!rateLimit) return;
        const current = read();
        for (const configuration of configurations) {
          if (configuration.templateId !== 'codex' || !current.some((entry) => entry.id === configuration.id && entry.revision === configuration.revision)) continue;
          const target = io.path.join(directory, 'snapshots', `${configuration.id}.json`);
          io.fs.mkdirSync(io.path.dirname(target), { recursive: true, mode: 0o700 });
          const temporary = `${target}.${io.uuid()}.tmp`;
          try {
            io.fs.writeFileSync(temporary, JSON.stringify({ revision: configuration.revision, observedAt: Date.now(), data: { rate_limit: rateLimit } }), { mode: 0o600 });
            io.fs.renameSync(temporary, target);
          } finally { io.fs.rmSync(temporary, { force: true }); }
        }
      } catch { console.warn('[quota] Could not save provider usage'); }
    }),
  ]);
}

export const materializeQuotaUsagePlugin = async ({ fsPromises, instanceDir }) => {
  const directory = path.join(instanceDir, 'openchamber-quota-usage');
  await fsPromises.mkdir(directory, { recursive: true });
  await fsPromises.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'openchamber-quota-usage', type: 'module', main: './index.js' }));
  const source = `import fs from 'node:fs';\nimport path from 'node:path';\nimport { randomUUID } from 'node:crypto';\n${parseCodexUsageHeaders.toString()}\n${observeUsage.toString()}\nexport default { id: 'openchamber-quota-usage', async setup(ctx) { await observeUsage(ctx, ${JSON.stringify(quotaDirectory())}, { fs, path, uuid: randomUUID }); } };\n`;
  const target = path.join(directory, 'index.js');
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { await fsPromises.writeFile(temporary, source); await fsPromises.rename(temporary, target); }
  finally { await fsPromises.rm(temporary, { force: true }); }
  return directory;
};
