
import { buildResult } from '../../utils/index.js';
import { resolveAntigravityAuth, DEFAULT_PROJECT_ID, isConfigured as isLegacyConfigured } from './auth.js';
import {
  refreshAntigravityToken,
  fetchAntigravityModels,
  fetchAntigravityQuotaSummary
} from './api.js';
import { transformSummary, transformModels } from './transforms.js';
import { warnIfGeminiGroupMissing } from './client.js';
import type { JsonValue } from '../../utils/contracts.js';

export const providerId = 'antigravity';
export const providerName = 'Antigravity';

let nativeReader: (() => Promise<JsonValue>) | undefined;
export const configureAntigravityQuotaReader = (reader: (() => Promise<JsonValue>) | undefined) => { nativeReader = reader; };
export const isConfigured = () => nativeReader !== undefined || isLegacyConfigured();

export const fetchQuota = async () => {
  if (nativeReader) {
    const { modelGroupWindows } = transformSummary(await nativeReader());
    if (!modelGroupWindows.length) throw new Error('Antigravity did not report quota groups');
    return buildResult({ providerId, providerName, ok: true, configured: true, usage: {
      windows: {}, models: Object.fromEntries(modelGroupWindows.map(group => [String(group.displayName), { windows: group.windows }])),
    } });
  }
  const auth = resolveAntigravityAuth();
  if (!auth) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  const accessToken = await refreshAntigravityToken(auth.refreshToken);
  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: 'Failed to refresh Antigravity token'
    });
  }

  const projectId = auth.projectId ?? DEFAULT_PROJECT_ID;

  const [summaryPayload, modelsPayload] = await Promise.all([
    fetchAntigravityQuotaSummary(accessToken, projectId),
    fetchAntigravityModels(accessToken, projectId)
  ]);

  warnIfGeminiGroupMissing(summaryPayload);
  const { modelGroupWindows } = transformSummary(summaryPayload);
  const models = transformModels(modelsPayload, modelGroupWindows);

  if (!Object.keys(models).length) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: 'Failed to fetch Antigravity quota'
    });
  }

  return buildResult({
    providerId,
    providerName,
    ok: true,
    configured: true,
    usage: {
      windows: {},
      models: Object.keys(models).length ? models : undefined
    }
  });
};
