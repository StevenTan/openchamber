import { asNonEmptyString } from '../shared/guards.js';
import type { CatalogModel } from '../agent-backends/contracts.js';
import type { ControlClient } from './opencode-client.js';
import type { ControlInput } from './contracts.js';
import type { ControlDependencies } from './service.js';
import { readOpenCodeModels } from '../agent-backends/opencode-adapter.js';

type ControlSettings = NonNullable<Awaited<ReturnType<ControlDependencies['readSettingsFromDiskMigrated']>>>;
const PREFERENCE_BY_RANK = new Map([[2, 'favorite'], [1, 'recent']]);
const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);

export function createModelSearch({ getClient, readSettingsFromDiskMigrated, registry }: {
  getClient(directory: string): Promise<ControlClient>;
  readSettingsFromDiskMigrated: ControlDependencies['readSettingsFromDiskMigrated'];
  registry: ControlDependencies['backendRegistry'];
}) {
  const searchModels = async (input: ControlInput, contextDirectory: ControlInput['directory'], sessionID?: string | null) => {
    await registry?.ready;
    const settings = await readSettingsFromDiskMigrated();
    const directory = asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory) || '';
    const readModels = registry?.forSession(sessionID ?? undefined).models ?? readOpenCodeModels;
    const { models: entries, providers: providerNames } = await readModels(getClient, directory, sessionID);
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
