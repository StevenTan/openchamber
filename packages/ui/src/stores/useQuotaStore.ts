import React from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ProviderResult, QuotaProviderId } from '@/types';
import type { QuotaProviderMeta } from '@/lib/quota';
import { fetchExtensionQuotaProviders, quotaProviderIds, quotaProviderList, sameExtensionQuotaProviders, type ExtensionQuotaProvider } from '@/lib/quota/extensionProviders';
import { getDesktopWindowVisibility, isDesktopShell, type DesktopSettings } from '@/lib/desktop';
import { isCapacitorApp } from '@/lib/platform';
import { getDefaultModels } from '@/lib/quota/model-families';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { fetchConfiguredQuotaProviders, fetchQuota } from '@/lib/quota/fetchQuota';
import { getRuntimeKey, isTransientRuntimeKey } from '@/lib/runtime-switch';
import { useConfigStore } from '@/stores/useConfigStore';
import { requestQuotaConfigurations, type QuotaConfiguration, type QuotaConfigurationInput, type QuotaConfigurationStatus } from '@/lib/quota/configurations';
import { runBackgroundNetworkTask } from '@/lib/background-network';

const QUOTA_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const QUOTA_OPEN_FRESHNESS_MS = 15 * 1000;
let quotaGeneration = 0;
let inFlightRuntimeLoad: Promise<void> | null = null;
let inFlightExtensionLoad: Promise<void> | null = null;
let extensionLoadAgain = false;
const quotaRequests = new Map<QuotaProviderId, { controller: AbortController; promise: Promise<boolean> }>();
let configuredProvidersRequest: Promise<ReadonlySet<string> | null> | null = null;
const quotaAutoRefreshConsumers = new Map<symbol, boolean>();
let quotaAutoRefreshInterval: number | null = null;
let lastVisibleRefreshAt: number | null = null;
let lastVisibleRefreshIncludedAll = false;
let nativeQuotaWindowVisible = false;

interface QuotaSettingsState {
  displayMode: 'usage' | 'remaining';
  dropdownProviderIds: QuotaProviderId[];
  savedDropdownProviderIds: string[] | null;
  selectedModels: Record<string, string[]>;
  expandedFamilies: Record<string, string[]>;
}

interface QuotaStore extends QuotaSettingsState {
  results: ProviderResult[];
  configurations: QuotaConfiguration[] | null;
  catalogRevision: number | null;
  providerResponseTemplates: string[];
  configurationLoadFailed: boolean;
  saveConfiguration: (input: QuotaConfigurationInput, id?: QuotaProviderId) => Promise<QuotaProviderId | null>;
  deleteConfiguration: (id: QuotaProviderId) => Promise<void>;
  /**
   * Usage providers installed extensions serve on this instance, after the
   * saved entries (`GET /api/quota/extensions`). Read on connect and whenever the
   * server announces a change; a failed read keeps the list it had.
   */
  extensionProviders: ExtensionQuotaProvider[];
  loadedRuntimeKey: string | null;
  selectedProviderId: QuotaProviderId | null;
  isCreatingConfiguration: boolean;
  startConfiguration: () => void;
  isLoading: boolean;
  isFetchingProvider: Record<string, boolean>;
  lastUpdated: number | null;
  error: string | null;
  refreshErrors: Partial<Record<QuotaProviderId, string>>;

  loadSettings: () => Promise<void>;
  /** Reads configurations and extension providers; each failed read retains its own catalog. */
  loadExtensionProviders: () => Promise<void>;
  fetchAllQuotas: () => Promise<void>;
  fetchQuotas: (providerIds: QuotaProviderId[], options?: { invalidate?: boolean }) => Promise<boolean>;
  fetchProviderQuota: (providerId: QuotaProviderId, invalidate?: boolean) => Promise<boolean>;
  setSelectedProvider: (providerId: QuotaProviderId | null) => void;
  setDisplayMode: (mode: 'usage' | 'remaining') => void;
  setProviderInDropdown: (providerId: QuotaProviderId, shown: boolean) => string[];
  setSelectedModels: (providerId: string, modelNames: string[]) => void;
  setExpandedFamilies: (providerId: string, familyIds: string[]) => void;
  toggleFamilyExpanded: (providerId: string, familyId: string) => void;
  applyDefaultSelections: (providerId: string, availableModels: string[]) => void;
  ensureLoadedForRuntime: (options?: { refresh?: boolean; allProviders?: boolean; visibleOnly?: boolean }) => Promise<void>;
  resetForRuntimeSwitch: () => void;
  refreshAfterCredentialChange: () => Promise<void>;
}

const resolveDropdownProviderIds = (saved: readonly string[] | null, known: readonly QuotaProviderId[]): QuotaProviderId[] => (
  saved === null
    ? [...known]
    : saved.filter((entry): entry is QuotaProviderId => known.some((id) => id === entry))
);

const parseSettings = (data: DesktopSettings, extensionProviders: readonly ExtensionQuotaProvider[]): QuotaSettingsState => {
  const displayMode = data.usageDisplayMode === 'remaining' ? 'remaining' : 'usage';
  const savedDropdownProviderIds = data.usageDropdownProviders ?? null;

  return {
    displayMode,
    savedDropdownProviderIds,
    dropdownProviderIds: resolveDropdownProviderIds(savedDropdownProviderIds, quotaProviderIds(extensionProviders)),
    selectedModels: data.usageSelectedModels ?? {},
    expandedFamilies: data.usageExpandedFamilies ?? {},
  };
};

const defaultQuotaSettings = (extensionProviders: readonly ExtensionQuotaProvider[] = []): QuotaSettingsState => ({
  displayMode: 'usage',
  savedDropdownProviderIds: null,
  dropdownProviderIds: quotaProviderIds(extensionProviders),
  selectedModels: {},
  expandedFamilies: {},
});

const loadSettingsFromRuntime = async (extensionProviders: readonly ExtensionQuotaProvider[]): Promise<QuotaSettingsState> => {
  const settings = await loadDesktopSettings();
  return settings ? parseSettings(settings, extensionProviders) : defaultQuotaSettings(extensionProviders);
};

const applyExtensionProviders = (next: ExtensionQuotaProvider[]): void => {
  const state = useQuotaStore.getState();
  if (sameExtensionQuotaProviders(state.extensionProviders, next)) return;
  const gone = state.extensionProviders.map((previous) => previous.id).filter((id) => !next.some((entry) => entry.id === id));
  const isGone = (id: string): boolean => gone.some((goneId) => goneId === id);
  for (const id of gone) {
    quotaRequests.get(id)?.controller.abort();
    quotaRequests.delete(id);
  }
  useQuotaStore.setState((current) => {
    const refreshErrors = { ...current.refreshErrors };
    for (const id of gone) delete refreshErrors[id];
    return {
      extensionProviders: next,
      dropdownProviderIds: resolveDropdownProviderIds(current.savedDropdownProviderIds, quotaProviderIds(next, current.configurations)),
      results: gone.length > 0 ? current.results.filter((result) => !isGone(result.providerId)) : current.results,
      refreshErrors,
      selectedProviderId: current.selectedProviderId !== null && isGone(current.selectedProviderId) ? null : current.selectedProviderId,
      isFetchingProvider: Object.fromEntries(Object.entries(current.isFetchingProvider).filter(([id]) => !isGone(id))),
      isLoading: quotaRequests.size > 0,
    };
  });
  const { results, loadedRuntimeKey, fetchQuotas } = useQuotaStore.getState();
  const arrived = next.map((entry) => entry.id).filter((id) => !results.some((result) => result.providerId === id) && !quotaRequests.has(id));
  if (arrived.length > 0 && (loadedRuntimeKey !== null || results.length > 0)) void fetchQuotas(arrived);
};

const applyConfigurations = (next: QuotaConfigurationStatus): void => {
  const state = useQuotaStore.getState();
  if (state.catalogRevision !== null && next.catalogRevision < state.catalogRevision) return;
  if (JSON.stringify(state.configurations) === JSON.stringify(next.configurations)
    && JSON.stringify(state.providerResponseTemplates) === JSON.stringify(next.providerResponseTemplates)) {
    useQuotaStore.setState({ catalogRevision: next.catalogRevision });
    return;
  }
  configuredProvidersRequest = null;
  const previous = state.configurations ?? [];
  const templateChanges = previous.filter(entry => next.configurations.some(current => current.id === entry.id && current.templateId !== entry.templateId)).map(entry => entry.id);
  const selectedModels = { ...state.selectedModels };
  const expandedFamilies = { ...state.expandedFamilies };
  for (const id of templateChanges) { delete selectedModels[id]; delete expandedFamilies[id]; }
  const invalid = [...new Set([
    ...previous.filter(entry => !next.configurations.some(current => current.id === entry.id && current.revision === entry.revision)).map(entry => entry.id),
    ...state.results.filter(entry => !entry.providerId.startsWith('ext-') && !next.configurations.some(current => current.id === entry.providerId)).map(entry => entry.providerId),
  ])];
  for (const id of invalid) {
    quotaRequests.get(id)?.controller.abort();
    quotaRequests.delete(id);
  }
  const names = new Map(next.configurations.map(entry => [entry.id, entry.name]));
  useQuotaStore.setState(current => {
    const refreshErrors = { ...current.refreshErrors };
    for (const id of invalid) delete refreshErrors[id];
    return {
      configurations: next.configurations,
      catalogRevision: next.catalogRevision,
      providerResponseTemplates: next.providerResponseTemplates,
      configurationLoadFailed: false,
      selectedModels,
      expandedFamilies,
      results: current.results.filter(entry => !invalid.includes(entry.providerId)).map(entry => ({ ...entry, providerName: names.get(entry.providerId) ?? entry.providerName })),
      refreshErrors,
      error: Object.values(refreshErrors)[0] ?? null,
      dropdownProviderIds: resolveDropdownProviderIds(current.savedDropdownProviderIds, quotaProviderIds(current.extensionProviders, next.configurations)),
      selectedProviderId: current.selectedProviderId && previous.some(entry => entry.id === current.selectedProviderId) && !names.has(current.selectedProviderId) ? null : current.selectedProviderId,
      isFetchingProvider: Object.fromEntries(Object.entries(current.isFetchingProvider).filter(([id]) => !invalid.some(value => value === id))),
      isLoading: quotaRequests.size > 0,
    };
  });
  if (templateChanges.length > 0) void updateDesktopSettings({ usageSelectedModels: selectedModels, usageExpandedFamilies: expandedFamilies });
  if (state.loadedRuntimeKey !== null || state.results.length > 0) {
    const arrived = next.configurations.filter(entry => !previous.some(old => old.id === entry.id && old.revision === entry.revision));
    void useQuotaStore.getState().fetchQuotas(arrived.map(entry => entry.id), { invalidate: true });
  }
};

/** Overlapping loads share one list read, as they share one request per provider. */
const readConfiguredProviders = () => {
  if (configuredProvidersRequest) return configuredProvidersRequest;
  const request: Promise<ReadonlySet<string> | null> = fetchConfiguredQuotaProviders().finally(() => {
    if (configuredProvidersRequest === request) configuredProvidersRequest = null;
  });
  configuredProvidersRequest = request;
  return request;
};

const recordNotConfigured = (set: (update: (state: QuotaStore) => Partial<QuotaStore>) => void, providerIds: QuotaProviderId[]) => {
  const absent = new Set<QuotaProviderId>(providerIds);
  const fetchedAt = Date.now();
  set((state) => {
    const refreshErrors = { ...state.refreshErrors };
    for (const providerId of absent) delete refreshErrors[providerId];
    return {
      results: [
        ...state.results.filter((entry) => !absent.has(entry.providerId)),
        ...quotaProviderList(state.extensionProviders, state.configurations).filter((provider) => absent.has(provider.id)).map((provider) => ({
          providerId: provider.id, providerName: provider.name, ok: false, configured: false, error: 'Not configured', usage: null, fetchedAt,
        })),
      ],
      refreshErrors,
      error: Object.values(refreshErrors)[0] ?? null,
      lastUpdated: fetchedAt,
    };
  });
};

export const useQuotaStore = create<QuotaStore>()(
  devtools(
    (set, get) => ({
      results: [],
      configurations: null,
      catalogRevision: null,
      providerResponseTemplates: [],
      configurationLoadFailed: false,
      extensionProviders: [],
      loadedRuntimeKey: null,
      selectedProviderId: null,
      isCreatingConfiguration: false,
      isLoading: false,
      isFetchingProvider: {},
      lastUpdated: null,
      error: null,
      refreshErrors: {},
      ...defaultQuotaSettings(),

      saveConfiguration: async (input, id) => {
        const generation = quotaGeneration;
        const next = await requestQuotaConfigurations(id ? 'PUT' : 'POST', id, input);
        if (generation !== quotaGeneration) return null;
        applyConfigurations(next);
        return get().configurations?.some(entry => entry.id === next.configuration?.id) ? next.configuration?.id ?? null : null;
      },
      deleteConfiguration: async (id) => {
        const generation = quotaGeneration;
        const next = await requestQuotaConfigurations('DELETE', id);
        if (generation === quotaGeneration) applyConfigurations(next);
      },

      loadSettings: async () => {
        const generation = quotaGeneration;
        try {
          const settings = await loadSettingsFromRuntime(get().extensionProviders);
          if (generation !== quotaGeneration) return;
          // The list is narrowed against the extensions known when the read lands; a later list read narrows it again.
          set({ ...settings, dropdownProviderIds: resolveDropdownProviderIds(settings.savedDropdownProviderIds, quotaProviderIds(get().extensionProviders, get().configurations)) });
        } catch (error) {
          console.warn('Failed to load usage settings:', error);
        }
      },

      loadExtensionProviders: async () => {
        if (inFlightExtensionLoad) {
          extensionLoadAgain = true;
          return inFlightExtensionLoad;
        }
        const generation = quotaGeneration;
        inFlightExtensionLoad = (async () => {
          await Promise.all([
            fetchExtensionQuotaProviders().then(next => {
              if (generation === quotaGeneration) applyExtensionProviders(next);
            }).catch(error => {
              if (generation === quotaGeneration) console.warn('Failed to load extension usage providers:', error);
            }),
            requestQuotaConfigurations().then(next => {
              if (generation === quotaGeneration) { set({ configurationLoadFailed: false }); applyConfigurations(next); }
            }).catch(error => {
              if (generation === quotaGeneration) {
                set({ configurationLoadFailed: true });
                console.warn('Failed to load usage configurations:', error);
              }
            }),
          ]);
        })().finally(() => {
          if (generation !== quotaGeneration) return;
          inFlightExtensionLoad = null;
          if (extensionLoadAgain) {
            extensionLoadAgain = false;
            void get().loadExtensionProviders();
          }
        });
        return inFlightExtensionLoad;
      },

      fetchQuotas: async (providerIds, { invalidate = false } = {}) => {
        const generation = quotaGeneration;
        const revisions = new Map(get().configurations?.map(entry => [entry.id, entry.revision]));
        try {
          if (!invalidate) set({ isLoading: true });
          const configured = invalidate ? null : await readConfiguredProviders();
          if (generation !== quotaGeneration) return false;
          const current = get();
          const active = providerIds.filter(id => {
            if (id.startsWith('ext-')) return current.extensionProviders.some(entry => entry.id === id);
            if (current.configurations === null) return true;
            const configuration = current.configurations.find(entry => entry.id === id);
            return configuration !== undefined && configuration.revision === revisions.get(id);
          });
          const absent = configured ? active.filter((providerId) => !configured.has(providerId)) : [];
          const targets = active.filter((providerId) => !absent.includes(providerId));
          if (absent.length > 0) recordNotConfigured(set, absent);
          if (targets.length === 0) set({ isLoading: quotaRequests.size > 0 });
          const answered = await Promise.all(targets.map((providerId) => get().fetchProviderQuota(providerId, invalidate)));
          if (generation !== quotaGeneration) return false;
          return absent.length > 0 || answered.some(Boolean);
        } catch (error) {
          if (generation !== quotaGeneration) return false;
          const message = error instanceof Error ? error.message : 'Failed to fetch quotas';
          set({ error: message });
          return false;
        }
      },

      fetchAllQuotas: async () => {
        set({ isLoading: true });
        await get().loadExtensionProviders();
        if (get().configurations === null) { set({ isLoading: false }); return; }
        await get().fetchQuotas(quotaProviderIds(get().extensionProviders, get().configurations));
      },

      fetchProviderQuota: async (providerId, invalidate = false) => {
        const existing = quotaRequests.get(providerId);
        if (existing && !invalidate) return existing.promise;
        if (existing) {
          existing.controller.abort();
          quotaRequests.delete(providerId);
        }
        if (invalidate) {
          set(state => {
            const refreshErrors = { ...state.refreshErrors };
            delete refreshErrors[providerId];
            return { results: state.results.filter(entry => entry.providerId !== providerId), refreshErrors, error: Object.values(refreshErrors)[0] ?? null };
          });
        }
        const generation = quotaGeneration;
        const controller = new AbortController();
        const promise = Promise.resolve().then(async () => {
          try {
            const fetched = await fetchQuota(providerId, { signal: controller.signal });
            const result = { ...fetched, providerName: get().configurations?.find(entry => entry.id === providerId)?.name ?? fetched.providerName };
            if (generation !== quotaGeneration || controller.signal.aborted) return false;
            // A reachable instance can still report that its provider request
            // failed. Configuration is known, but there is no new usage sample.
            if (!result.ok && result.configured) {
              const message = result.error || 'Failed to fetch quota';
              set(state => {
                const previous = state.results.find(entry => entry.providerId === providerId);
                const keepPrevious = previous?.configured && !invalidate;
                const results = keepPrevious
                  ? state.results
                  : [...state.results.filter(entry => entry.providerId !== providerId), result];
                return { results, refreshErrors: { ...state.refreshErrors, [providerId]: message }, error: message };
              });
              return true;
            }
            set((state) => {
              const refreshErrors = { ...state.refreshErrors };
              delete refreshErrors[providerId];
              const results = state.results.filter(entry => entry.providerId !== providerId);
              results.push(result);
              return { results, refreshErrors, error: Object.values(refreshErrors)[0] ?? null, lastUpdated: Date.now() };
            });
            return true;
          } catch (error) {
            if (generation !== quotaGeneration) return false;
            if (controller.signal.aborted) return false;
            const message = error instanceof Error ? error.message : 'Failed to fetch quota';
            set(state => ({ refreshErrors: { ...state.refreshErrors, [providerId]: message }, error: message }));
            return false;
          } finally {
            const ownsRequest = quotaRequests.get(providerId)?.controller === controller;
            if (ownsRequest) quotaRequests.delete(providerId);
            if (generation === quotaGeneration && (ownsRequest || quotaRequests.has(providerId))) {
              // A superseded request finishes while its replacement still runs;
              // the provider stays fetching until the replacement settles too.
              set((state) => ({
                isFetchingProvider: { ...state.isFetchingProvider, [providerId]: quotaRequests.has(providerId) },
                isLoading: quotaRequests.size > 0,
              }));
            }
          }
        });
        quotaRequests.set(providerId, { controller, promise });
        set(state => ({ isLoading: true, isFetchingProvider: { ...state.isFetchingProvider, [providerId]: true } }));
        return promise;
      },

      ensureLoadedForRuntime: async ({ refresh = false, allProviders = false, visibleOnly = false } = {}) => {
        const runtimeKey = getRuntimeKey();
        if (isTransientRuntimeKey(runtimeKey)) return;
        if (!useConfigStore.getState().isInitialized) return;
        if (visibleOnly && !hasVisibleQuotaReadout()) return;
        if (!refresh && get().loadedRuntimeKey === runtimeKey && get().configurations !== null) return;
        const generation = quotaGeneration;
        let missingProvidersOnly = false;
        if (inFlightRuntimeLoad) {
          await inFlightRuntimeLoad;
          if (generation !== quotaGeneration) return;
          if (!allProviders) return;
          missingProvidersOnly = true;
        }

        inFlightRuntimeLoad = (async () => {
          // Both say what this instance shows: its settings and the providers its extensions serve.
          await Promise.all([
            ...(get().loadedRuntimeKey !== runtimeKey ? [get().loadSettings()] : []),
            ...(get().loadedRuntimeKey !== runtimeKey || get().configurations === null ? [get().loadExtensionProviders()] : []),
          ]);
          if (generation !== quotaGeneration) return;
          if (get().configurations === null) return;
          if (visibleOnly && !hasVisibleQuotaReadout()) {
            lastVisibleRefreshAt = null;
            lastVisibleRefreshIncludedAll = false;
            return;
          }
          if (!useConfigStore.getState().isInitialized) return;
          const { dropdownProviderIds, fetchQuotas } = get();
          const requestedIds = allProviders ? quotaProviderIds(get().extensionProviders, get().configurations) : dropdownProviderIds;
          const providerIds = missingProvidersOnly
            ? requestedIds.filter(providerId => !get().results.some(result => result.providerId === providerId))
            : requestedIds;
          if (providerIds.length === 0) {
            set({ loadedRuntimeKey: runtimeKey });
            return;
          }
          const answered = await fetchQuotas(providerIds);
          if (answered && generation === quotaGeneration) set({ loadedRuntimeKey: runtimeKey });
        })().finally(() => { if (generation === quotaGeneration) inFlightRuntimeLoad = null; });

        return inFlightRuntimeLoad;
      },

      resetForRuntimeSwitch: () => {
        quotaGeneration += 1;
        configuredProvidersRequest = null;
        for (const request of quotaRequests.values()) request.controller.abort();
        quotaRequests.clear();
        inFlightRuntimeLoad = null;
        inFlightExtensionLoad = null;
        extensionLoadAgain = false;
        lastVisibleRefreshAt = null;
        lastVisibleRefreshIncludedAll = false;
        set({
          ...defaultQuotaSettings(),
          extensionProviders: [],
          configurations: null,
          catalogRevision: null,
          providerResponseTemplates: [],
          configurationLoadFailed: false,
          results: [],
          loadedRuntimeKey: null,
          selectedProviderId: null,
          isCreatingConfiguration: false,
          isLoading: false,
          isFetchingProvider: {},
          lastUpdated: null,
          error: null,
          refreshErrors: {},
        });
      },

      refreshAfterCredentialChange: async () => {
        quotaGeneration += 1;
        configuredProvidersRequest = null;
        for (const request of quotaRequests.values()) request.controller.abort();
        quotaRequests.clear();
        inFlightRuntimeLoad = null;
        inFlightExtensionLoad = null;
        extensionLoadAgain = false;
        lastVisibleRefreshAt = null;
        lastVisibleRefreshIncludedAll = false;
        set({ results: [], loadedRuntimeKey: null, isLoading: false, isFetchingProvider: {}, lastUpdated: null, refreshErrors: {}, error: null });
        if (!hasVisibleQuotaReadout()) return;
        await get().ensureLoadedForRuntime({ refresh: true, allProviders: [...quotaAutoRefreshConsumers.values()].some(Boolean), visibleOnly: true });
      },

      startConfiguration: () => set({ isCreatingConfiguration: true }),
      setSelectedProvider: (providerId) => set({ selectedProviderId: providerId, isCreatingConfiguration: false }),
      setDisplayMode: (mode) => set({ displayMode: mode }),
      setProviderInDropdown: (providerId, shown) => {
        const { savedDropdownProviderIds, dropdownProviderIds, extensionProviders } = get();
        const base: readonly string[] = savedDropdownProviderIds ?? dropdownProviderIds;
        const next = shown ? [...new Set([...base, providerId])] : base.filter((id) => id !== providerId);
        set({ savedDropdownProviderIds: next, dropdownProviderIds: resolveDropdownProviderIds(next, quotaProviderIds(extensionProviders, get().configurations)) });
        return next;
      },

      setSelectedModels: (providerId, modelNames) => {
        set((state) => ({
          selectedModels: { ...state.selectedModels, [providerId]: modelNames }
        }));
      },

      setExpandedFamilies: (providerId, familyIds) => {
        set((state) => ({
          expandedFamilies: { ...state.expandedFamilies, [providerId]: familyIds }
        }));
        void updateDesktopSettings({ usageExpandedFamilies: get().expandedFamilies });
      },

      toggleFamilyExpanded: (providerId, familyId) => {
        set((state) => {
          const currentExpanded = state.expandedFamilies[providerId] ?? [];
          const isExpanded = currentExpanded.includes(familyId);
          const nextExpanded = isExpanded
            ? currentExpanded.filter((id) => id !== familyId)
            : [...currentExpanded, familyId];
          return {
            expandedFamilies: { ...state.expandedFamilies, [providerId]: nextExpanded }
          };
        });
        void updateDesktopSettings({ usageExpandedFamilies: get().expandedFamilies });
      },

      applyDefaultSelections: (providerId, availableModels) => {
        const state = get();
        if ((state.selectedModels[providerId]?.length ?? 0) > 0) return;

        const templateId = get().configurations?.find(entry => entry.id === providerId)?.templateId ?? providerId as QuotaProviderId;
        const defaults = getDefaultModels(templateId, availableModels);
        if (defaults.length === 0) return;

        set((s) => ({
          selectedModels: { ...s.selectedModels, [providerId]: defaults },
        }));
        void updateDesktopSettings({ usageSelectedModels: get().selectedModels });
      },
    }),
    { name: 'quota-store' }
  )
);

const hasVisibleQuotaReadout = () => quotaAutoRefreshConsumers.size > 0
  && globalThis.document !== undefined && document.visibilityState !== 'hidden'
  && ((!isDesktopShell() && !isCapacitorApp()) || nativeQuotaWindowVisible);

const refreshVisibleQuotas = (tray = false) => {
  if ((!tray && !hasVisibleQuotaReadout()) || !useConfigStore.getState().isInitialized) return;
  const allProviders = !tray && [...quotaAutoRefreshConsumers.values()].some(Boolean);
  const now = Date.now();
  if (lastVisibleRefreshAt !== null && now - lastVisibleRefreshAt < QUOTA_OPEN_FRESHNESS_MS
    && (!allProviders || lastVisibleRefreshIncludedAll)) return;
  lastVisibleRefreshAt = now;
  lastVisibleRefreshIncludedAll = allProviders;
  void runBackgroundNetworkTask(async () => {
    if (!tray && !hasVisibleQuotaReadout()) {
      if (lastVisibleRefreshAt === now) {
        lastVisibleRefreshAt = null;
        lastVisibleRefreshIncludedAll = false;
      }
      return;
    }
    await useQuotaStore.getState().ensureLoadedForRuntime({ refresh: true, allProviders, visibleOnly: !tray });
  }, 'active-session');
};

export const refreshTrayQuotas = (initial = false) => {
  if (initial && useQuotaStore.getState().loadedRuntimeKey === getRuntimeKey()) return;
  refreshVisibleQuotas(true);
};

const updateQuotaAutoRefresh = () => {
  if (!hasVisibleQuotaReadout()) {
    if (quotaAutoRefreshInterval !== null) window.clearInterval(quotaAutoRefreshInterval);
    quotaAutoRefreshInterval = null;
    return;
  }
  refreshVisibleQuotas();
  if (quotaAutoRefreshInterval === null) quotaAutoRefreshInterval = window.setInterval(refreshVisibleQuotas, QUOTA_REFRESH_INTERVAL_MS);
};

export const useQuotaAutoRefresh = (visible = true, allProviders = false) => {
  const isInitialized = useConfigStore(state => state.isInitialized);
  const [nativeVisible, setNativeVisible] = React.useState(() => !isDesktopShell() && !isCapacitorApp());
  React.useEffect(() => {
    let disposed = false;
    let removeListener: (() => void) | undefined;
    const reportNativeVisibility = (value: boolean) => {
      nativeQuotaWindowVisible = value;
      setNativeVisible(value);
      updateQuotaAutoRefresh();
    };
    if (isDesktopShell()) {
      let revision = 0;
      const onVisibility = (event: Event) => {
        if (!(event instanceof CustomEvent) || (event.detail !== true && event.detail !== false)) return;
        revision += 1;
        reportNativeVisibility(event.detail);
      };
      window.addEventListener('openchamber:window-visibility', onVisibility);
      void getDesktopWindowVisibility().then(value => {
        if (!disposed && revision === 0) reportNativeVisibility(value === true);
      }).catch(() => undefined);
      removeListener = () => window.removeEventListener('openchamber:window-visibility', onVisibility);
    } else if (isCapacitorApp()) {
      void import('@capacitor/app').then(async ({ App }) => {
        if (disposed) return;
        let revision = 0;
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          revision += 1;
          if (!disposed) reportNativeVisibility(isActive);
        });
        if (disposed) { void handle.remove(); return; }
        removeListener = () => { void handle.remove(); };
        const state = await App.getState();
        if (!disposed && revision === 0) reportNativeVisibility(state.isActive);
      }).catch(() => undefined);
    }
    return () => { disposed = true; removeListener?.(); };
  }, []);
  React.useEffect(() => {
    if (!visible || !isInitialized || !nativeVisible) return;
    const consumer = Symbol();
    quotaAutoRefreshConsumers.set(consumer, allProviders);
    if (quotaAutoRefreshConsumers.size === 1) document.addEventListener('visibilitychange', updateQuotaAutoRefresh);
    updateQuotaAutoRefresh();

    return () => {
      quotaAutoRefreshConsumers.delete(consumer);
      if (quotaAutoRefreshConsumers.size === 0) document.removeEventListener('visibilitychange', updateQuotaAutoRefresh);
      updateQuotaAutoRefresh();
    };
  }, [visible, allProviders, isInitialized, nativeVisible]);
};

/** The instance's usage configurations and extension providers, in catalog order. */
export const useQuotaProviders = (): QuotaProviderMeta[] => {
  const extensionProviders = useQuotaStore((state) => state.extensionProviders);
  const configurations = useQuotaStore((state) => state.configurations);
  return React.useMemo(() => quotaProviderList(extensionProviders, configurations), [extensionProviders, configurations]);
};
