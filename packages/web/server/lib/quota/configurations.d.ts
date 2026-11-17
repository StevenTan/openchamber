import type { BuiltInQuotaProviderId, QuotaProviderId } from '../../../../ui/src/types/quota';
import type { ZodType } from 'zod';
export interface QuotaConfigurationInput {
  name: string;
  templateId: BuiltInQuotaProviderId;
  providerId: string | null;
  source: 'account' | 'provider';
}
export interface QuotaConfiguration extends QuotaConfigurationInput {
  id: QuotaProviderId;
  revision: string;
}
export interface QuotaConfigurationStatus {
  configurations: QuotaConfiguration[];
  catalogRevision: number;
  providerResponseTemplates: BuiltInQuotaProviderId[];
  configuration?: QuotaConfiguration;
}
export const configurationInputSchema: ZodType<QuotaConfigurationInput>;
export function readQuotaConfigurations(): QuotaConfiguration[];
export function readQuotaConfiguration(id: string): QuotaConfiguration | null;
export function quotaConfigurationsNeedMigration(): boolean;
export function migrateQuotaConfigurations(configuredTemplateIds: readonly string[]): void;
export function quotaConfigurationStatus(providerResponses?: boolean): QuotaConfigurationStatus;
export function mutateQuotaConfiguration(method: string, id: string | undefined, input: QuotaConfigurationInput | undefined, providerResponses?: boolean): QuotaConfigurationStatus;
