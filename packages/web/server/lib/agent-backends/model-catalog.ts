import type { BackendRegistry } from './registry.js';
import type { createScheduledTaskService } from '../scheduled-tasks/service.js';

export function createBackendModelCatalog(registry: BackendRegistry, readOpenCode: NonNullable<Parameters<typeof createScheduledTaskService>[0]['readModelCatalog']>): NonNullable<Parameters<typeof createScheduledTaskService>[0]['readModelCatalog']> {
  return async (directory: string, providerID?: string) => {
    await registry.ready;
    return registry.forProvider(providerID).modelCatalog(readOpenCode)(directory, providerID);
  };
}
