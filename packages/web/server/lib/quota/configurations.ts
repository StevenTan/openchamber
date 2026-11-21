import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { quotaTemplates } from './templates.js';
import { QuotaRouteError } from './route-error.js';
import { isMissingFileError } from '../share-pages/file-errors.js';
import type { JsonObject } from '../shared/json-values.js';

const templateId = z.enum(quotaTemplates.map((entry) => entry.id));
export const configurationInputSchema = z.object({
  name: z.string().trim().min(1),
  templateId,
  providerId: z.string().trim().min(1).nullable(),
  source: z.enum(['account', 'provider']),
});
const configurationSchema = configurationInputSchema.extend({
  id: z.string().regex(/^[a-z0-9-]+$/),
  revision: z.string().uuid(),
});
export type QuotaConfigurationInput = z.infer<typeof configurationInputSchema>;
export type QuotaConfiguration = z.infer<typeof configurationSchema>;
export type QuotaConfigurationStatus = ReturnType<typeof quotaConfigurationStatus>;

const fileSchema = z.object({ version: z.union([z.literal(1), z.literal(2)]), configurations: z.array(configurationSchema), catalogRevision: z.number().int().nonnegative() }).superRefine((value, ctx) => {
  if (new Set(value.configurations.map((entry) => entry.id)).size !== value.configurations.length) ctx.addIssue({ code: 'custom', message: 'Duplicate usage configuration ID' });
});

export const quotaDirectory = () => path.resolve(process.env.OPENCHAMBER_DATA_DIR || path.join(os.homedir(), '.config', 'openchamber'), 'quota');
export const readQuotaJson = (file: string, io = fs): JsonObject | null => {
  try { return JSON.parse(io.readFileSync(file, 'utf8')); } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
};
const writeQuotaJson = (file: string, value: JsonObject) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
};

export const configurationSnapshotPath = (id: string) => path.join(quotaDirectory(), 'snapshots', `${id}.json`);
const filePath = () => path.join(quotaDirectory(), 'configurations.json');
const persist = (configurations: QuotaConfiguration[]) => {
  const previous = readQuotaJson(filePath());
  const catalogRevision = (previous === null ? 0 : fileSchema.parse(previous).catalogRevision) + 1;
  writeQuotaJson(filePath(), fileSchema.parse({ version: 2, configurations, catalogRevision }));
};

const readQuotaCatalog = () => {
  const stored = readQuotaJson(filePath());
  if (stored !== null) return fileSchema.parse(stored);
  const legacy = readQuotaJson(path.join(quotaDirectory(), 'codex-source.json'));
  const legacySource = legacy === null ? null : z.object({ mode: z.enum(['chatgpt', 'provider']), providerId: z.string().nullable().optional(), revision: z.string().uuid() }).parse(legacy);
  const configurations: QuotaConfiguration[] = legacySource ? [{
    id: 'codex', name: 'Codex', templateId: 'codex',
    source: legacySource.mode === 'provider' ? 'provider' : 'account',
    providerId: legacySource.providerId ?? null,
    revision: legacySource.revision,
  }] : [];
  if (legacySource?.mode === 'provider') {
    const snapshot = readQuotaJson(path.join(quotaDirectory(), 'codex-snapshot.json'));
    if (snapshot?.revision === legacySource.revision) writeQuotaJson(configurationSnapshotPath('codex'), { revision: snapshot.revision, observedAt: snapshot.observedAt, data: { rate_limit: snapshot.rate_limit } });
  }
  persist(configurations);
  return fileSchema.parse(readQuotaJson(filePath()));
};

export const readQuotaConfigurations = () => readQuotaCatalog().configurations;
export const readQuotaConfiguration = (id: string | undefined) => readQuotaConfigurations().find((entry) => entry.id === id) ?? null;
export const quotaConfigurationsNeedMigration = () => {
  const stored = readQuotaJson(filePath());
  return stored !== null && fileSchema.parse(stored).version === 1;
};
export const migrateQuotaConfigurations = (configuredTemplateIds: readonly (string | null)[]) => {
  const stored = readQuotaJson(filePath());
  if (stored === null) return;
  const catalog = fileSchema.parse(stored);
  if (catalog.version === 2) return;
  const configured = new Set(configuredTemplateIds);
  const configurations = catalog.configurations.filter((entry) => {
    const template = quotaTemplates.find((candidate) => candidate.id === entry.id);
    return !template || configured.has(entry.templateId) || entry.name !== template.name || entry.templateId !== template.id || entry.source !== 'account' || entry.providerId !== null;
  });
  persist(configurations);
};
const createQuotaConfiguration = (input: QuotaConfigurationInput) => {
  const configurations = readQuotaConfigurations();
  const fields = configurationInputSchema.parse(input);
  const configuration = { ...fields, id: `quota-${randomUUID()}`, revision: randomUUID() };
  persist([...configurations, configuration]);
  return configuration;
};
const updateQuotaConfiguration = (id: string | undefined, input: QuotaConfigurationInput) => {
  const configurations = readQuotaConfigurations();
  const index = configurations.findIndex((entry) => entry.id === id);
  const previous = configurations[index];
  if (!previous) throw new QuotaRouteError(404, 'CONFIGURATION_NOT_FOUND', 'Usage configuration not found');
  const fields = configurationInputSchema.parse(input);
  const sourceChanged = previous.templateId !== fields.templateId || previous.source !== fields.source || previous.providerId !== fields.providerId;
  const configuration = { ...fields, id: previous.id, revision: sourceChanged ? randomUUID() : previous.revision };
  configurations[index] = configuration;
  persist(configurations);
  return configuration;
};
const deleteQuotaConfiguration = (id: string | undefined) => {
  const configurations = readQuotaConfigurations();
  const configuration = configurations.find((entry) => entry.id === id);
  if (!configuration) throw new QuotaRouteError(404, 'CONFIGURATION_NOT_FOUND', 'Usage configuration not found');
  persist(configurations.filter((entry) => entry.id !== id));
  for (const file of [configurationSnapshotPath(configuration.id)]) {
    try { fs.rmSync(file, { force: true }); }
    catch { console.warn(`[quota] Could not delete saved data for ${id}`); }
  }
};

let supportsResponses = () => false;
export const configureQuotaResponseSupport = (supported: () => boolean) => { supportsResponses = supported; };
export const quotaResponseSupport = () => supportsResponses();
export const quotaConfigurationStatus = (providerResponses = quotaResponseSupport()) => {
  const { configurations, catalogRevision } = readQuotaCatalog();
  return { configurations, catalogRevision, providerResponseTemplates: providerResponses ? ['codex' as const] : [] };
};

export const mutateQuotaConfiguration = (method: string | undefined, id: string | undefined, input: Parameters<typeof configurationInputSchema.safeParse>[0], providerResponses = quotaResponseSupport()) => {
  if (method === 'DELETE') { deleteQuotaConfiguration(id); return quotaConfigurationStatus(providerResponses); }
  const parsed = configurationInputSchema.safeParse(input);
  if (!parsed.success) throw new QuotaRouteError(400, 'INVALID_CONFIGURATION', 'Invalid usage configuration');
  const fields = parsed.data;
  const previous = id ? readQuotaConfiguration(id) : null;
  if (id && !previous) throw new QuotaRouteError(404, 'CONFIGURATION_NOT_FOUND', 'Usage configuration not found');
  const changesSource = !previous || previous.templateId !== fields.templateId || previous.source !== fields.source || previous.providerId !== fields.providerId;
  if (changesSource && fields.source === 'provider' && (!providerResponses || fields.templateId !== 'codex')) throw new QuotaRouteError(400, 'UNSUPPORTED_SOURCE', 'Provider responses are unavailable for this template in this runtime');
  const configuration = method === 'POST' ? createQuotaConfiguration(fields) : updateQuotaConfiguration(id, fields);
  return { ...quotaConfigurationStatus(providerResponses), configuration };
};
