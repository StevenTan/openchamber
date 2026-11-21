
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import { extensionQuotaProvider, extensionQuotaProviderEntries } from '../extension-registry.js';
import { QuotaRouteError } from '../route-error.js';
import { buildResult } from '../utils/index.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
import type { QuotaResult } from '../utils/contracts.js';
interface QuotaProvider { providerId: string | null; providerName: string; isConfigured(auth: LegacyAuthFile): boolean; fetchQuota(): Promise<QuotaResult<string | null, string | null>> }

import * as claude from './claude/index.js';
import * as clinePass from './cline-pass.js';
import * as codex from './codex.js';
import type { QuotaConfiguration } from '../configurations.js';
import { readQuotaConfigurations, readQuotaConfiguration, quotaConfigurationsNeedMigration, migrateQuotaConfigurations } from '../configurations.js';
import { fetchResponseQuota } from '../response-usage.js';
import * as copilot from './copilot.js';
import * as cursor from './cursor.js';
import * as deepinfra from './deepinfra.js';
import * as deepseek from './deepseek.js';
import * as exeDev from './exe-dev.js';
import * as google from './google/index.js';
import * as antigravity from './antigravity/index.js';
import * as hyper from './hyper.js';
import * as kimi from './kimi.js';
import * as mistral from './mistral.js';
import * as nanogpt from './nanogpt.js';
import * as openai from './openai.js';
import * as openrouter from './openrouter.js';
import * as zai from './zai.js';
import * as zhipuaiCodingPlan from './zhipuai-coding-plan.js';
import * as minimaxCodingPlan from './minimax-coding-plan.js';
import * as minimaxCnCodingPlan from './minimax-cn-coding-plan.js';
import * as neuralwatt from './neuralwatt.js';
import * as kilo from './kilo.js';
import * as zenmux from './zenmux.js';
import * as ollamaCloud from './ollama-cloud.js';
import * as wafer from './wafer.js';
import * as opencodeGo from './opencode-go.js';
import * as opencode from './opencode.js';
import * as xai from './xai.js';

interface QuotaRegistry { [id: string]: QuotaProvider }
const registry: QuotaRegistry = {
  claude: {
    providerId: claude.providerId,
    providerName: claude.providerName,
    isConfigured: claude.isConfigured,
    fetchQuota: claude.fetchQuota
  },
  'cline-pass': {
    providerId: clinePass.providerId,
    providerName: clinePass.providerName,
    isConfigured: clinePass.isConfigured,
    fetchQuota: clinePass.fetchQuota
  },
  codex: {
    providerId: codex.providerId,
    providerName: codex.providerName,
    isConfigured: codex.isConfigured,
    fetchQuota: codex.fetchQuota
  },
  cursor: {
    providerId: cursor.providerId,
    providerName: cursor.providerName,
    isConfigured: cursor.isConfigured,
    fetchQuota: cursor.fetchQuota
  },
  deepinfra: {
    providerId: deepinfra.providerId,
    providerName: deepinfra.providerName,
    isConfigured: deepinfra.isConfigured,
    fetchQuota: deepinfra.fetchQuota
  },
  deepseek: {
    providerId: deepseek.providerId,
    providerName: deepseek.providerName,
    isConfigured: deepseek.isConfigured,
    fetchQuota: deepseek.fetchQuota
  },
  'exe-dev': {
    providerId: exeDev.providerId,
    providerName: exeDev.providerName,
    isConfigured: exeDev.isConfigured,
    fetchQuota: exeDev.fetchQuota
  },
  google: {
    providerId: google.providerId,
    providerName: google.providerName,
    isConfigured: google.isConfigured,
    fetchQuota: google.fetchGoogleQuota
  },
  antigravity: {
    providerId: antigravity.providerId,
    providerName: antigravity.providerName,
    isConfigured: antigravity.isConfigured,
    fetchQuota: antigravity.fetchQuota
  },
  hyper: {
    providerId: hyper.providerId,
    providerName: hyper.providerName,
    isConfigured: hyper.isConfigured,
    fetchQuota: hyper.fetchQuota
  },
  'zai-coding-plan': {
    providerId: zai.providerId,
    providerName: zai.providerName,
    isConfigured: zai.isConfigured,
    fetchQuota: zai.fetchQuota
  },
  'zhipuai-coding-plan': {
    providerId: zhipuaiCodingPlan.providerId,
    providerName: zhipuaiCodingPlan.providerName,
    isConfigured: zhipuaiCodingPlan.isConfigured,
    fetchQuota: zhipuaiCodingPlan.fetchQuota
  },
  'kimi-for-coding': {
    providerId: kimi.providerId,
    providerName: kimi.providerName,
    isConfigured: kimi.isConfigured,
    fetchQuota: kimi.fetchQuota
  },
  openrouter: {
    providerId: openrouter.providerId,
    providerName: openrouter.providerName,
    isConfigured: openrouter.isConfigured,
    fetchQuota: openrouter.fetchQuota
  },
  'nano-gpt': {
    providerId: nanogpt.providerId,
    providerName: nanogpt.providerName,
    isConfigured: nanogpt.isConfigured,
    fetchQuota: nanogpt.fetchQuota
  },
  'github-copilot': {
    providerId: copilot.providerId,
    providerName: copilot.providerName,
    isConfigured: copilot.isConfigured,
    fetchQuota: copilot.fetchQuota
  },
  'github-copilot-addon': {
    providerId: copilot.providerIdAddon,
    providerName: copilot.providerNameAddon,
    isConfigured: copilot.isConfigured,
    fetchQuota: copilot.fetchQuotaAddon
  },
  'minimax-coding-plan': {
    providerId: minimaxCodingPlan.providerId,
    providerName: minimaxCodingPlan.providerName,
    isConfigured: minimaxCodingPlan.isConfigured,
    fetchQuota: minimaxCodingPlan.fetchQuota
  },
  'minimax-cn-coding-plan': {
    providerId: minimaxCnCodingPlan.providerId,
    providerName: minimaxCnCodingPlan.providerName,
    isConfigured: minimaxCnCodingPlan.isConfigured,
    fetchQuota: minimaxCnCodingPlan.fetchQuota
  },
  'ollama-cloud': {
    providerId: ollamaCloud.providerId,
    providerName: ollamaCloud.providerName,
    isConfigured: ollamaCloud.isConfigured,
    fetchQuota: ollamaCloud.fetchQuota
  },
  wafer: {
    providerId: wafer.providerId,
    providerName: wafer.providerName,
    isConfigured: wafer.isConfigured,
    fetchQuota: wafer.fetchQuota
  },
  'opencode-go': {
    providerId: opencodeGo.providerId,
    providerName: opencodeGo.providerName,
    isConfigured: opencodeGo.isConfigured,
    fetchQuota: opencodeGo.fetchQuota
  },
  opencode: {
    providerId: opencode.providerId,
    providerName: opencode.providerName,
    isConfigured: opencode.isConfigured,
    fetchQuota: opencode.fetchQuota
  },
  neuralwatt: {
    providerId: neuralwatt.providerId,
    providerName: neuralwatt.providerName,
    isConfigured: neuralwatt.isConfigured,
    fetchQuota: neuralwatt.fetchQuota
  },
  kilo: {
    providerId: kilo.providerId,
    providerName: kilo.providerName,
    isConfigured: kilo.isConfigured,
    fetchQuota: kilo.fetchQuota
  },
  zenmux: {
    providerId: zenmux.providerId,
    providerName: zenmux.providerName,
    isConfigured: () => zenmux.isConfigured(),
    fetchQuota: zenmux.fetchQuota
  },
  xai: {
    providerId: xai.providerId,
    providerName: xai.providerName,
    isConfigured: xai.isConfigured,
    fetchQuota: xai.fetchQuota
  },
  mistral: {
    providerId: mistral.providerId,
    providerName: mistral.providerName,
    isConfigured: mistral.isConfigured,
    fetchQuota: mistral.fetchQuota
  }
};

export { attachExtensionQuotaProvider, detachExtensionQuotaProvider } from '../extension-registry.js';

function providerOf(providerId: QuotaConfiguration['templateId']): QuotaProvider;
function providerOf(providerId: string | null): QuotaProvider | null | undefined;
function providerOf(providerId: string | null) { return Object.hasOwn(registry, String(providerId)) ? registry[String(providerId)] : extensionQuotaProvider(providerId); }

const pendingFetches = new Map<string | null, Promise<QuotaResult<string | null, string | null>>>();

const NOT_ON_USAGE_PAGE = new Set<string | null>([copilot.providerIdAddon]);

export const initializeQuotaConfigurations = async () => {
  if (!quotaConfigurationsNeedMigration()) return;
  const auth = await readOpenCodeCredentials();
  migrateQuotaConfigurations(Object.entries(registry).filter(([, provider]) => provider.isConfigured(auth)).map(([id]) => id));
};

export const listUsagePageProviders = async () => {
  await initializeQuotaConfigurations();
  return [
    ...readQuotaConfigurations().map((entry) => ({ providerId: entry.id, providerName: entry.name })),
    ...extensionQuotaProviderEntries().map(([providerId, provider]) => ({ providerId, providerName: provider.providerName })),
  ];
};

export const listConfiguredQuotaProviders = async () => {
  await initializeQuotaConfigurations();
  const auth = await readOpenCodeCredentials();
  const configured = [];

  for (const configuration of readQuotaConfigurations()) {
    const provider = providerOf(configuration.templateId);
    if (configuration.source === 'provider' ? configuration.providerId !== null : provider.isConfigured(auth)) configured.push(configuration.id);
  }
  for (const [id, provider] of extensionQuotaProviderEntries()) if (provider.isConfigured(auth)) configured.push(id);

  return configured;
};

const fetchQuotaForProviderUncoalesced = async (providerId: string | null) => {
  const provider = providerOf(providerId);

  if (!provider) {
    return buildResult({
      providerId,
      providerName: providerId,
      ok: false,
      configured: false,
      error: 'Unsupported provider'
    });
  }

  try {
    return await provider.fetchQuota();
  } catch (error) {
    if (error instanceof QuotaRouteError) throw error;
    return buildResult({
      providerId: provider.providerId,
      providerName: provider.providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed'
    });
  }
};

export const fetchQuotaForProvider = (providerId: string | null) => {
  const configuration = readQuotaConfiguration(providerId ?? undefined);
  const key = configuration ? `${providerId}:${configuration.revision}` : providerId;
  const existing = configuration?.templateId === claude.providerId ? undefined : pendingFetches.get(key);
  if (existing) return existing;
  const pending = (async () => {
    if (!configuration) {
      if (Object.hasOwn(registry, String(providerId)) && !NOT_ON_USAGE_PAGE.has(providerId)) return buildResult({ providerId, providerName: providerId, ok: false, configured: false, error: 'Usage configuration not found' });
      return fetchQuotaForProviderUncoalesced(providerId);
    }
    try {
      const result = configuration.source === 'provider'
        ? fetchResponseQuota(configuration)
        : await fetchQuotaForProviderUncoalesced(configuration.templateId);
      return { ...result, providerId: configuration.id, providerName: configuration.name };
    } catch (error) {
      return buildResult({ providerId: configuration.id, providerName: configuration.name, ok: false, configured: true, error: String(error instanceof Error ? error.message : error) });
    }
  })().finally(() => { if (pendingFetches.get(key) === pending) pendingFetches.delete(key); });
  pendingFetches.set(key, pending);
  return pending;
};

export const fetchClaudeQuota = claude.fetchQuota;
export const fetchOpenaiQuota = openai.fetchQuota;
export const fetchGoogleQuota = google.fetchGoogleQuota;
export const fetchAntigravityQuota = antigravity.fetchQuota;
export const fetchCodexQuota = codex.fetchQuota;
export const fetchCursorQuota = cursor.fetchQuota;
export const fetchDeepinfraQuota = deepinfra.fetchQuota;
export const fetchDeepseekQuota = deepseek.fetchQuota;
export const fetchHyperQuota = hyper.fetchQuota;
export const fetchCopilotQuota = copilot.fetchQuota;
export const fetchCopilotAddonQuota = copilot.fetchQuotaAddon;
export const fetchKimiQuota = kimi.fetchQuota;
export const fetchOpenRouterQuota = openrouter.fetchQuota;
export const fetchZaiQuota = zai.fetchQuota;
export const fetchNanoGptQuota = nanogpt.fetchQuota;
export const fetchMinimaxCodingPlanQuota = minimaxCodingPlan.fetchQuota;
export const fetchMinimaxCnCodingPlanQuota = minimaxCnCodingPlan.fetchQuota;
export const fetchOllamaCloudQuota = ollamaCloud.fetchQuota;
export const fetchWaferQuota = wafer.fetchQuota;
export const fetchZhipuaiQuota = zhipuaiCodingPlan.fetchQuota;
export const fetchOpenCodeQuota = opencode.fetchQuota;
