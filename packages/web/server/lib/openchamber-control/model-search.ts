import { asNonEmptyString } from '../shared/guards.js';
import type { ModelInfo } from '@opencode/client';
import type { ControlClient } from './opencode-client.js';
import type { ControlInput } from './contracts.js';
import type { ControlDependencies } from './service.js';

type ControlSettings = NonNullable<Awaited<ReturnType<ControlDependencies['readSettingsFromDiskMigrated']>>>;
const PREFERENCE_BY_RANK = new Map([[2, 'favorite'], [1, 'recent']]);
const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);

export function createModelSearch({ getClient, readSettingsFromDiskMigrated, antigravity }: {
  getClient(directory: string): Promise<ControlClient>;
  readSettingsFromDiskMigrated: ControlDependencies['readSettingsFromDiskMigrated'];
  antigravity: ControlDependencies['antigravity'];
}) {
  const searchModels = async (input: ControlInput, contextDirectory: ControlInput['directory'], sessionID?: string | null) => {
    type CatalogModel = Pick<ModelInfo, 'id' | 'providerID' | 'name'> & Partial<Pick<ModelInfo, 'family' | 'time' | 'cost' | 'status'>> & { variants: readonly { id: string }[] };
    const native = sessionID?.startsWith('ses_ag_') ? antigravity : undefined;
    const settings = await readSettingsFromDiskMigrated();
    let entries: readonly CatalogModel[];
    let providerNames: Map<string, string>;
    if (native && sessionID) {
      const session = await native.get(sessionID);
      const model = session.config.find(option => option.category === 'model' && option.type === 'select');
      const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
      const variants = thought?.type === 'select' ? thought.options.flatMap(option => 'group' in option ? option.options : [option]).map(option => ({ id: option.value })) : [];
      entries = model?.type === 'select' ? model.options.flatMap(option => 'group' in option ? option.options : [option]).map(option => ({ id: option.value, providerID: 'antigravity', name: option.name, variants })) : [];
      providerNames = new Map([['antigravity', 'Antigravity']]);
    } else {
      const client = await getClient(asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory) || '');
      const [catalog, providers] = await Promise.all([client.model.list(), client.provider.list()]);
      entries = catalog.data;
      providerNames = new Map(providers.data.map(provider => [provider.id, provider.name]));
    }
    const refKey = (ref: ControlSettings['recentModels']) => {
      const fields: { providerID?: unknown; modelID?: unknown } | undefined = ref == null ? undefined : Object(ref);
      return `${fields?.providerID}/${fields?.modelID}`;
    };
    const modelKey = (model: CatalogModel) => `${model.providerID}/${model.id}`;
    const refs = (value: ControlSettings['hiddenModels']) => new Set((Array.isArray(value) ? value : []).map(refKey));
    const hidden = refs(settings?.hiddenModels);
    const rank = new Map([
      ...[...refs(settings?.recentModels)].map((key) => [key, 1] as const),
      ...[...refs(settings?.favoriteModels)].map((key) => [key, 2] as const),
    ]);
    const provider = asNonEmptyString(input.provider)?.toLowerCase();
    const terms = (asNonEmptyString(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = entries
      .filter((model) => !hidden.has(modelKey(model)))
      .filter((model) => !provider
        || model.providerID.toLowerCase() === provider
        || providerNames.get(model.providerID)?.toLowerCase() === provider)
      .filter((model) => {
        const text = `${modelKey(model)} ${model.name}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      });
    const familyOf = (model: CatalogModel) => `${model.providerID}/${model.family}`;
    const newestOfFamily = new Map<string, number>();
    for (const model of candidates) {
      if (!model.family || rank.has(modelKey(model))) continue;
      newestOfFamily.set(familyOf(model), Math.max(newestOfFamily.get(familyOf(model)) ?? 0, (model.time?.released ?? 0)));
    }
    const matching = candidates
      .toSorted((left, right) => (rank.get(modelKey(right)) ?? 0) - (rank.get(modelKey(left)) ?? 0)
        || left.providerID.localeCompare(right.providerID)
        || (right.time?.released ?? 0) - (left.time?.released ?? 0))
      .filter((model) => input.all === true || !model.family || rank.has(modelKey(model))
        || (model.time?.released ?? 0) >= Number(newestOfFamily.get(familyOf(model))));
    const offset = isSafeInteger(input.offset) && input.offset > 0 ? input.offset : 0;
    const limit = isSafeInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 10;
    const page = matching.slice(offset, offset + limit);
    return {
      models: page.map((model) => ({
        id: modelKey(model),
        name: model.name,
        provider: providerNames.get(model.providerID) ?? model.providerID,
        preference: PREFERENCE_BY_RANK.get(rank.get(modelKey(model)) ?? 0),
        released: (model.time?.released ?? 0),
        variants: model.variants.map((variant) => variant.id),
        cost: model.cost,
        status: model.status,
      })),
      total: matching.length,
      next: offset + limit < matching.length ? offset + limit : null,
    };
  };
  return searchModels;
}
