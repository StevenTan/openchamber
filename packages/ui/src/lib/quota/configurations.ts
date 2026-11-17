import { z } from 'zod';
import { runtimeFetch } from '@/lib/runtime-fetch';
import type { BuiltInQuotaProviderId, QuotaProviderId } from '@/types';
import { QUOTA_PROVIDERS } from './providers';
export type { QuotaConfiguration, QuotaConfigurationInput, QuotaConfigurationStatus } from '../../../../web/server/lib/quota/configurations.js';
import type { QuotaConfigurationInput, QuotaConfigurationStatus } from '../../../../web/server/lib/quota/configurations.js';

const templateId = z.custom<BuiltInQuotaProviderId>((value) => QUOTA_PROVIDERS.some((entry) => entry.id === value));
const customConfigurationId = z.string().regex(/^quota-[a-z0-9-]+$/);
const configurationSchema = z.object({
  id: z.custom<QuotaProviderId>((value) => customConfigurationId.safeParse(value).success || QUOTA_PROVIDERS.some((entry) => entry.id === value)),
  name: z.string().min(1), templateId, providerId: z.string().nullable(), source: z.enum(['account', 'provider']), revision: z.string(),
});
const statusSchema = z.object({ configurations: z.array(configurationSchema), providerResponseTemplates: z.array(templateId), configuration: configurationSchema.optional(), catalogRevision: z.number().int().nonnegative() });

export const requestQuotaConfigurations = async (method = 'GET', id?: string, input?: QuotaConfigurationInput): Promise<QuotaConfigurationStatus> => {
  const request: RequestInit = { method };
  if (input) {
    request.headers = { 'Content-Type': 'application/json' };
    request.body = JSON.stringify(input);
  }
  const response = await runtimeFetch(`/api/quota/configurations${id ? `/${encodeURIComponent(id)}` : ''}`, request);
  if (!response.ok) throw new Error('Usage configuration request failed');
  return statusSchema.parse(await response.json());
};
