import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';
import type { ExtensionQuotaProviderId, QuotaProviderId } from '@/types';

import type { QuotaProviderMeta } from './providers';
import type { QuotaConfiguration } from './configurations';

export type ExtensionQuotaProvider = {
  id: ExtensionQuotaProviderId;
  name: string;
  icon: string;
  guestId: string;
};

export const isExtensionQuotaProviderId = (providerId: string): providerId is ExtensionQuotaProviderId => providerId.startsWith('ext-');

const EXTENSION_QUOTA_PROVIDER_ID = /^ext-[a-z][a-z0-9-]{0,27}$/;
const extensionQuotaProviderSchema = z.object({
  id: z.custom<ExtensionQuotaProviderId>((value) => String(value) === value && EXTENSION_QUOTA_PROVIDER_ID.test(value)),
  name: z.string().trim().min(1),
  icon: z.string().trim().min(1),
  guestId: z.string().regex(/^[a-z][a-z0-9-]{0,27}$/),
});
const providersAnswerSchema = z.object({ extensions: z.array(extensionQuotaProviderSchema).max(64) });

export const fetchExtensionQuotaProviders = async ({ signal }: { signal?: AbortSignal } = {}): Promise<ExtensionQuotaProvider[]> => {
  const response = await runtimeFetch('/api/quota/extensions', { signal });
  if (!response.ok) throw new Error(`Failed to list usage providers (${response.status})`);
  return providersAnswerSchema.parse(await response.json()).extensions;
};

export const sameExtensionQuotaProviders = (a: readonly ExtensionQuotaProvider[], b: readonly ExtensionQuotaProvider[]): boolean => (
  a.length === b.length && a.every((entry, index) => {
    const other = b[index];
    return entry.id === other.id && entry.name === other.name && entry.icon === other.icon && entry.guestId === other.guestId;
  })
);

/** Saved usage configurations followed by the extensions' providers. */
export const quotaProviderList = (extensionProviders: readonly ExtensionQuotaProvider[], configurations: readonly QuotaConfiguration[] | null = null): QuotaProviderMeta[] => [
  ...(configurations ?? []).map(({ id, name, templateId }) => ({ id, name, templateId })),
  ...extensionProviders.map(({ id, name }) => ({ id, name })),
];

/** The ids of every usage provider to draw, in the same order. */
export const quotaProviderIds = (extensionProviders: readonly ExtensionQuotaProvider[], configurations: readonly QuotaConfiguration[] | null = null): QuotaProviderId[] => (
  quotaProviderList(extensionProviders, configurations).map((provider) => provider.id)
);
