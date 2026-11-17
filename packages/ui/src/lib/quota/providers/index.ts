import type { QuotaProviderId, BuiltInQuotaProviderId } from '@/types';
import { quotaTemplates } from '../../../../../web/server/lib/quota/templates.js';

export interface QuotaProviderMeta {
  id: QuotaProviderId;
  name: string;
  templateId?: BuiltInQuotaProviderId;
}

/** Base usage templates available when adding a configuration. */
export const QUOTA_PROVIDERS = quotaTemplates;
