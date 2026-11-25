import type { createAntigravityBackend } from './antigravity.js';
import type { createScheduledTaskService } from '../scheduled-tasks/service.js';

export function createBackendModelCatalog(backend: ReturnType<typeof createAntigravityBackend>, readOpenCode: NonNullable<Parameters<typeof createScheduledTaskService>[0]['readModelCatalog']>): NonNullable<Parameters<typeof createScheduledTaskService>[0]['readModelCatalog']> {
  return async (directory: string, providerID?: string) => {
    if (providerID !== 'antigravity') return readOpenCode(directory);
    const session = await backend.prepare(directory);
    const model = session.config.find(option => option.category === 'model' && option.type === 'select');
    return model?.type === 'select' ? model.options.flatMap(option => 'group' in option ? option.options : [option]).map(option => ({ providerID: 'antigravity', id: option.value })) : [];
  };
}
