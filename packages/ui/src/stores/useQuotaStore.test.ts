import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { QuotaConfigurationStatus, QuotaConfiguration } from "@/lib/quota/configurations"
import { QUOTA_PROVIDERS } from "@/lib/quota"
import type { ProviderResult } from "@/types"

let runtimeKey = "url:https://instance-a"
let isInitialized = true
const fetched: string[] = []

type StubPayload = { usageDropdownProviders: string[] } | { extensions: never[] } | ProviderResult | QuotaConfigurationStatus
let catalog: QuotaConfigurationStatus = { configurations: [], catalogRevision: 0, providerResponseTemplates: ['codex'] }
const resetCatalog = () => { catalog = { configurations: QUOTA_PROVIDERS.map(entry => ({ id: entry.id, name: entry.name, templateId: entry.id, source: 'account' as const, providerId: null, revision: 'initial' })), catalogRevision: 1, providerResponseTemplates: ['codex'] } }
let catalogFails = false;
let mutationGate: ((answer: QuotaConfigurationStatus, method?: string) => Promise<QuotaConfigurationStatus>) | null = null;
let quotaRequestsFail = false
let quotaFails = false;
// What `/api/quota/providers` names; null answers 500, as a restarting OpenCode does.
let configuredProviders: string[] | null = []
let listGate: Promise<void> | null = null
// Holds a quota request open until the test lets it answer.
let quotaGate: (() => Promise<void>) | null = null
const json = (body: StubPayload) => new Response(
  JSON.stringify(body),
  { status: 200, headers: { "content-type": "application/json" } },
)

// Spread the real modules so the overrides stay a patch: `mock.module` is
// process-global, and a partial replacement would break every other module
// that imports something else from these files.
const runtimeSwitch = await import("@/lib/runtime-switch")
mock.module("@/lib/runtime-switch", () => ({ ...runtimeSwitch, getRuntimeKey: () => runtimeKey }))

const runtimeFetchModule = await import("@/lib/runtime-fetch")
const quotaRuntimeFetch = async (path: string, options?: RequestInit) => {
    fetched.push(path)
    if (quotaRequestsFail) throw new Error("network down")
    if (path.startsWith("/api/config/settings")) return json({ usageDropdownProviders: ["claude"] })
    // The extensions' usage providers, read beside the settings; none installed here.
    if (path === "/api/quota/extensions") return json({ extensions: [] })
    if (path.startsWith('/api/quota/configurations')) {
      if ((!options?.method || options.method === 'GET') && catalogFails) return new Response('{}', { status: 503 });
      if (options?.method && options.method !== 'GET') catalog.catalogRevision += 1;
      const input = options?.body ? JSON.parse(String(options.body)) : null;
      const id = catalog.configurations.find(entry => entry.id === path.split('/')[4])?.id;
      if (options?.method === 'DELETE') { catalog.configurations = catalog.configurations.filter(entry => entry.id !== id); return json(catalog); }
      if (input) {
        const previous = catalog.configurations.find(entry => entry.id === id);
        const changed = previous && (previous.templateId !== input.templateId || previous.source !== input.source || previous.providerId !== input.providerId);
        const configuration: QuotaConfiguration = { ...input, id: id ?? 'quota-test', revision: changed ? 'changed' : previous?.revision ?? 'new' };
        catalog.configurations = [...catalog.configurations.filter(entry => entry.id !== configuration.id), configuration];
        const answer = { ...catalog, configurations: [...catalog.configurations], configuration };
        return json(mutationGate ? await mutationGate(answer, options?.method) : answer);
      }
      return json(catalog);
    }
    if (path === "/api/quota/providers" && listGate) await listGate
    if (path === "/api/quota/providers") return configuredProviders ? Response.json({ providers: configuredProviders }) : new Response("{}", { status: 500 })
    const provider = catalog.configurations.find(entry => entry.id === path.split('/').at(-1));
    if (!provider) throw new Error('Unexpected quota endpoint in test fixture');
    if (quotaGate) await quotaGate()
    // A reachable instance reporting a provider failure, which is different
    // from the transport failure `quotaRequestsFail` models.
    if (quotaFails) return json({ providerId: "claude", providerName: "Claude", ok: false, configured: true, error: "authentication failed", usage: null, fetchedAt: 2 })
    const providerId = provider.id;
    return json({ providerId, providerName: catalog.configurations.find(entry => entry.id === providerId)?.name ?? providerId, ok: true, configured: true, usage: null, fetchedAt: 1 })
  }
mock.module("@/lib/runtime-fetch", () => ({
  ...runtimeFetchModule,
  runtimeFetch: quotaRuntimeFetch,
}))

const configStoreModule = await import("@/stores/useConfigStore")
mock.module("@/stores/useConfigStore", () => ({
  ...configStoreModule,
  useConfigStore: { ...configStoreModule.useConfigStore, getState: () => ({ isInitialized }) },
}))

const { useQuotaStore } = await import("./useQuotaStore")

describe("Usage quotas are loaded once per ready instance", () => {
  beforeEach(() => {
    runtimeKey = "url:https://instance-a"
    isInitialized = true
    fetched.length = 0
    resetCatalog()
    quotaRequestsFail = false
    configuredProviders = ["claude"]
    useQuotaStore.getState().resetForRuntimeSwitch()
  })

  test("nothing is fetched while the instance has not reported itself initialised", async () => {
    isInitialized = false
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(fetched).toHaveLength(0)
    expect(useQuotaStore.getState().loadedRuntimeKey).toBeNull()

    // The instance finishes starting up: the same call now performs the load
    // that a mount-time fetch would have answered "nothing configured".
    isInitialized = true
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(fetched.length).toBeGreaterThan(0)
    expect(useQuotaStore.getState().results.length).toBeGreaterThan(0)
  })

  test("a second ask for the same instance does not refetch", async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime()
    const afterFirst = fetched.length
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(fetched.length).toBe(afterFirst)
  })

  test("a switch drops the previous instance's quotas and reloads for the new one", async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime()
    expect(useQuotaStore.getState().results.length).toBeGreaterThan(0)

    useQuotaStore.getState().resetForRuntimeSwitch()
    expect(useQuotaStore.getState().results).toEqual([])
    expect(useQuotaStore.getState().lastUpdated).toBeNull()

    runtimeKey = "url:https://instance-b"
    fetched.length = 0
    resetCatalog()
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(fetched.length).toBeGreaterThan(0)
    expect(useQuotaStore.getState().loadedRuntimeKey).toBe("url:https://instance-b")
  })

  test("a quota still in flight for the previous instance cannot land in the new one", async () => {
    const pending = useQuotaStore.getState().fetchProviderQuota("claude")
    useQuotaStore.getState().resetForRuntimeSwitch()
    await pending

    expect(useQuotaStore.getState().results).toEqual([])
  })

  test("a transient runtime key loads nothing", async () => {
    runtimeKey = "mobile-disconnected"
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(fetched).toHaveLength(0)
  })

  test("a failed load is not recorded as loaded, so the next ask retries it", async () => {
    quotaRequestsFail = true
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(useQuotaStore.getState().loadedRuntimeKey).toBeNull()

    quotaRequestsFail = false
    fetched.length = 0
    resetCatalog()
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(fetched.length).toBeGreaterThan(0)
    expect(useQuotaStore.getState().loadedRuntimeKey).toBe("url:https://instance-a")
  })

  test("concurrent asks share one load", async () => {
    await Promise.all([
      useQuotaStore.getState().ensureLoadedForRuntime(),
      useQuotaStore.getState().ensureLoadedForRuntime(),
    ])

    expect(fetched.filter((path) => path === "/api/quota/claude")).toHaveLength(1)
  })

  test("a switch drops the previous instance's display settings", async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime()
    expect(useQuotaStore.getState().dropdownProviderIds).toEqual(["claude"])
    useQuotaStore.getState().setDisplayMode("remaining")

    useQuotaStore.getState().resetForRuntimeSwitch()

    // `dropdownProviderIds` decides which providers get queried, so carrying it
    // over would ask the new instance through the old one's selection.
    expect(useQuotaStore.getState().dropdownProviderIds).toEqual([])
    expect(useQuotaStore.getState().displayMode).toBe("usage")
  })
})

describe("Quotas are requested only for providers with a credential", () => {
  const requested = () => fetched.filter((path) => path.startsWith("/api/quota/") && path !== "/api/quota/providers" && path !== "/api/quota/extensions" && !path.startsWith("/api/quota/configurations"))

  beforeEach(() => {
    fetched.length = 0
    resetCatalog()
    quotaRequestsFail = false
    quotaFails = false
    configuredProviders = ["claude", "github-copilot-addon"]
    useQuotaStore.getState().resetForRuntimeSwitch()
  })

  test("one list read replaces a request per unconfigured provider, and they still have results", async () => {
    await useQuotaStore.getState().fetchAllQuotas()

    expect(requested()).toEqual(["/api/quota/claude"])
    const { results } = useQuotaStore.getState()
    expect(results.find((entry) => entry.providerId === "claude")?.configured).toBe(true)
    expect(results.find((entry) => entry.providerId === "codex")).toMatchObject({ configured: false, usage: null, error: "Not configured" })
  })

  test("a list that failed asks every provider and reads as no credential on none", async () => {
    configuredProviders = null
    await useQuotaStore.getState().fetchQuotas(["claude", "codex"])

    expect(requested()).toEqual(["/api/quota/claude", "/api/quota/codex"])
  })

  test("a removed credential clears the sample and the error of the account it belonged to", async () => {
    await useQuotaStore.getState().loadExtensionProviders()
    await useQuotaStore.getState().fetchQuotas(["claude"])
    useQuotaStore.setState({ refreshErrors: { claude: "boom" }, error: "boom" })
    configuredProviders = []
    await useQuotaStore.getState().fetchQuotas(["claude"])

    const state = useQuotaStore.getState()
    expect(state.results.find((entry) => entry.providerId === "claude")?.configured).toBe(false)
    expect(state.refreshErrors).toEqual({})
    expect(state.error).toBeNull()
  })

  test("an instance with no credentials counts as answered, so the load is not retried", async () => {
    configuredProviders = []
    await useQuotaStore.getState().ensureLoadedForRuntime()

    expect(useQuotaStore.getState().loadedRuntimeKey).toBe(runtimeKey)
    expect(requested()).toEqual([])
  })

  test("a load whose configured providers all failed stays unloaded, so the next ask retries", async () => {
    configuredProviders = ["claude"]
    quotaRequestsFail = false
    const failing = useQuotaStore.getState().fetchProviderQuota
    useQuotaStore.setState({ fetchProviderQuota: async () => false })
    await useQuotaStore.getState().ensureLoadedForRuntime()
    useQuotaStore.setState({ fetchProviderQuota: failing })

    expect(useQuotaStore.getState().loadedRuntimeKey).toBeNull()
  })

  test("overlapping loads share one list read and show as loading while it runs", async () => {
    let release = () => {}
    listGate = new Promise((resolve) => { release = resolve })
    const load = useQuotaStore.getState().fetchAllQuotas()
    const second = useQuotaStore.getState().fetchAllQuotas()
    await Promise.resolve()

    expect(useQuotaStore.getState().isLoading).toBe(true)
    release()
    listGate = null
    await Promise.all([load, second])
    expect(fetched.filter((path) => path === "/api/quota/providers")).toHaveLength(1)
    expect(useQuotaStore.getState().isLoading).toBe(false)
  })

  test("an instance with no credentials stops showing as loading", async () => {
    configuredProviders = []
    await useQuotaStore.getState().fetchQuotas(["claude"])

    expect(useQuotaStore.getState().isLoading).toBe(false)
  })

  test("an account switch goes straight to the provider it names", async () => {
    configuredProviders = []
    await useQuotaStore.getState().fetchQuotas(["claude"], { invalidate: true })

    expect(fetched).toEqual(["/api/quota/claude"])
  })
})

describe("A provider-account switch re-reads the trackers", () => {
  beforeEach(() => {
    runtimeKey = "url:https://instance-a"
    isInitialized = true
    fetched.length = 0
    resetCatalog()
    quotaRequestsFail = false
    quotaFails = false
    quotaGate = null
    configuredProviders = ["claude"]
    useQuotaStore.getState().resetForRuntimeSwitch()
  })

  test("a switch to an account whose fetch fails does not keep showing the old account's usage", async () => {
    // The failure mode this guards: after a switch the numbers did not move, so
    // the credential looked unchanged. They did not move because the new
    // account's fetch failed and the old account's sample was preserved.
    await useQuotaStore.getState().ensureLoadedForRuntime()
    expect(useQuotaStore.getState().results.some((r) => r.providerId === "claude")).toBe(true)

    quotaFails = true
    await useQuotaStore.getState().fetchQuotas(["claude"], { invalidate: true })

    // The old account's sample is gone; what remains is this account's failure.
    const entry = useQuotaStore.getState().results.find((r) => r.providerId === "claude")
    expect(entry?.usage).toBeNull()
    expect(entry?.ok).toBe(false)
    expect(useQuotaStore.getState().refreshErrors.claude).toBeTruthy()
  })

  test("a periodic refresh still preserves the last sample when a fetch fails", async () => {
    // The other half of the rule: a blip must not blank a surface showing real
    // numbers for the same account.
    await useQuotaStore.getState().ensureLoadedForRuntime()
    const before = useQuotaStore.getState().results.find((r) => r.providerId === "claude")

    quotaFails = true
    await useQuotaStore.getState().fetchQuotas(["claude"])

    const after = useQuotaStore.getState().results.find((r) => r.providerId === "claude")
    expect(after?.fetchedAt).toBe(before?.fetchedAt)
    expect(useQuotaStore.getState().refreshErrors.claude).toBeTruthy()
  })

  test("an account switch clears its sample before a request that fails in transport", async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime()
    expect(useQuotaStore.getState().results.some((entry) => entry.providerId === "claude")).toBe(true)
    quotaRequestsFail = true
    const pending = useQuotaStore.getState().fetchProviderQuota("claude", true)
    expect(useQuotaStore.getState().results.some((entry) => entry.providerId === "claude")).toBe(false)
    await pending
    expect(useQuotaStore.getState().results.some((entry) => entry.providerId === "claude")).toBe(false)
    expect(useQuotaStore.getState().refreshErrors.claude).toBe("network down")
  })

  test("a switch does not reuse a request in flight for the previous account", async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime()
    fetched.length = 0
    resetCatalog()

    // The stub resolves synchronously, so the in-flight request is stood in for
    // with one that has not answered yet. What matters is that the switch does
    // not hand back that request's promise.
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const realFetch = runtimeFetchModule.runtimeFetch
    mock.module("@/lib/runtime-fetch", () => ({
      ...runtimeFetchModule,
      runtimeFetch: async (path: string) => {
        fetched.push(path)
        if (path === "/api/quota/claude") await gate
        return realFetch(path)
      },
    }))

    const superseded = useQuotaStore.getState().fetchProviderQuota("claude")
    const afterSwitch = useQuotaStore.getState().fetchProviderQuota("claude", true)

    release()
    expect(await superseded).toBe(false)
    expect(await afterSwitch).toBe(true)
    expect(useQuotaStore.getState().refreshErrors.claude).toBeUndefined()
    // Two requests: the switch asked again rather than waiting for the first.
    expect(fetched.filter((path) => path === "/api/quota/claude")).toHaveLength(2)
  })

  test("the provider stays fetching while the request that superseded another is still out", async () => {
    const releases: Array<() => void> = []
    quotaGate = () => new Promise<void>((resolve) => { releases.push(resolve) })

    // The switch aborts the first request, which settles at once while the
    // replacement is still waiting on the network.
    const superseded = useQuotaStore.getState().fetchProviderQuota("claude")
    const afterSwitch = useQuotaStore.getState().fetchProviderQuota("claude", true)
    expect(await superseded).toBe(false)
    expect(useQuotaStore.getState().isFetchingProvider.claude).toBe(true)

    while (releases.length === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    releases[0]()
    await afterSwitch
    expect(useQuotaStore.getState().isFetchingProvider.claude).toBe(false)
  })
})


describe('Usage configuration lifecycle', () => {
  beforeEach(() => {
    mock.module("@/lib/runtime-fetch", () => ({ ...runtimeFetchModule, runtimeFetch: quotaRuntimeFetch }));
    catalogFails = false; mutationGate = null;
    resetCatalog(); fetched.length = 0; quotaRequestsFail = false; quotaFails = false; quotaGate = null; listGate = null;
    configuredProviders = ['claude']; isInitialized = true; runtimeKey = 'url:https://instance-a';
    useQuotaStore.getState().resetForRuntimeSwitch();
  });

  test('an empty catalog completes bootstrap and creating its first entry starts a quota read', async () => {
    catalog.configurations = [];
    await useQuotaStore.getState().ensureLoadedForRuntime({ allProviders: true });
    expect(useQuotaStore.getState().configurations).toEqual([]);
    expect(useQuotaStore.getState().loadedRuntimeKey).toBe(runtimeKey);
    fetched.length = 0;
    await useQuotaStore.getState().ensureLoadedForRuntime({ allProviders: true });
    expect(fetched).toEqual([]);
    const id = await useQuotaStore.getState().saveConfiguration({ name: 'Personal', templateId: 'codex', source: 'provider', providerId: 'proxy' });
    expect(fetched).toContain(`/api/quota/${id}`);
    await useQuotaStore.getState().fetchProviderQuota(id!);
  });

  test('a new entry has its own result and visibility key', async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime({ allProviders: true });
    const source = catalog.configurations.find(entry => entry.id === 'claude')!;
    const id = await useQuotaStore.getState().saveConfiguration({ ...source, name: 'Personal' });
    expect(id).toBe('quota-test');
    await useQuotaStore.getState().fetchProviderQuota(id!);
    expect(useQuotaStore.getState().configurations?.find(entry => entry.id === id)?.name).toBe('Personal');
    expect(useQuotaStore.getState().results.find(entry => entry.providerId === id)?.providerName).toBe('Personal');
    expect(useQuotaStore.getState().results.find(entry => entry.providerId === 'claude')?.providerName).toBe('Claude');
    expect(useQuotaStore.getState().setProviderInDropdown(id!, true)).toContain(id!);
  });

  test('renaming retains its sample and updates the displayed name without another quota read', async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime();
    const previous = useQuotaStore.getState().results.find(entry => entry.providerId === 'claude');
    const source = catalog.configurations.find(entry => entry.id === 'claude')!;
    fetched.length = 0;
    await useQuotaStore.getState().saveConfiguration({ ...source, name: 'Work' }, source.id);
    expect(useQuotaStore.getState().results.find(entry => entry.providerId === source.id)).toEqual({ ...previous, providerName: 'Work' });
    expect(fetched).toEqual(['/api/quota/configurations/claude']);
  });

  test('changing a source clears the old sample even when refresh fails', async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime();
    const source = catalog.configurations.find(entry => entry.id === 'claude')!;
    quotaFails = true;
    await useQuotaStore.getState().saveConfiguration({ ...source, providerId: 'new-account' }, source.id);
    await useQuotaStore.getState().fetchProviderQuota(source.id);
    expect(useQuotaStore.getState().results.find(entry => entry.providerId === source.id)?.usage).toBeNull();
    expect(useQuotaStore.getState().results.find(entry => entry.providerId === source.id)?.fetchedAt).not.toBe(1);
  });

  test('changing templates clears model selections belonging to the previous template', async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime();
    const source = catalog.configurations.find(entry => entry.id === 'claude')!;
    useQuotaStore.setState({ selectedModels: { claude: ['claude-sonnet-4'] }, expandedFamilies: { claude: ['claude'] } });
    await useQuotaStore.getState().saveConfiguration({ ...source, templateId: 'google' }, source.id);
    expect(useQuotaStore.getState().selectedModels.claude).toBeUndefined();
    expect(useQuotaStore.getState().expandedFamilies.claude).toBeUndefined();
    useQuotaStore.getState().applyDefaultSelections('claude', ['gemini-3-flash']);
    expect(useQuotaStore.getState().selectedModels.claude).toEqual(['gemini-3-flash']);
  });

  test('deleting a configuration aborts its pending result and removes it from readouts', async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime();
    let release!: () => void;
    quotaGate = () => new Promise<void>(resolve => { release = resolve; });
    const pending = useQuotaStore.getState().fetchProviderQuota('claude');
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    await useQuotaStore.getState().deleteConfiguration('claude');
    release(); await pending;
    expect(useQuotaStore.getState().configurations?.some(entry => entry.id === 'claude')).toBe(false);
    expect(useQuotaStore.getState().results.some(entry => entry.providerId === 'claude')).toBe(false);
    expect(useQuotaStore.getState().dropdownProviderIds).not.toContain('claude');
  });
});


describe('Usage catalog ordering and recovery', () => {
  beforeEach(() => {
    mock.module("@/lib/runtime-fetch", () => ({ ...runtimeFetchModule, runtimeFetch: quotaRuntimeFetch }));
    resetCatalog(); catalogFails = false; mutationGate = null; quotaRequestsFail = false; quotaFails = false; quotaGate = null; listGate = null;
    configuredProviders = ['claude']; isInitialized = true; runtimeKey = 'url:https://instance-a';
    useQuotaStore.getState().resetForRuntimeSwitch();
  });

  test('an older mutation response cannot replace a newer catalog', async () => {
    await useQuotaStore.getState().ensureLoadedForRuntime();
    let release!: () => void;
    mutationGate = async (answer, method) => { if (method === 'POST') await new Promise<void>(resolve => { release = resolve; }); return answer; };
    const source = catalog.configurations.find(entry => entry.id === 'claude')!;
    const pending = useQuotaStore.getState().saveConfiguration({ ...source, name: 'Personal' });
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    await useQuotaStore.getState().saveConfiguration({ ...source, name: 'Work' }, source.id);
    release(); await pending;
    expect(catalog.configurations.find(entry => entry.id === 'claude')?.name).toBe('Work');
    expect(useQuotaStore.getState().configurations?.find(entry => entry.id === 'claude')?.name).toBe('Work');
  });

  test('a failed initial catalog read is retried after the connection recovers', async () => {
    catalogFails = true;
    await useQuotaStore.getState().ensureLoadedForRuntime();
    expect(useQuotaStore.getState().configurations).toBeNull();
    expect(useQuotaStore.getState().configurationLoadFailed).toBe(true);
    catalogFails = false;
    await useQuotaStore.getState().ensureLoadedForRuntime({ refresh: true, allProviders: true });
    expect(useQuotaStore.getState().configurations?.length).toBe(QUOTA_PROVIDERS.length);
    expect(useQuotaStore.getState().configurationLoadFailed).toBe(false);
  });
});
