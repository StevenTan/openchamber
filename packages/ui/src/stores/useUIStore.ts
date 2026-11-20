import { withZoneView, getZoneView, CONTEXT_ZONES } from '@/lib/workspace/zones';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { useContext } from 'react';
import { subscribeRuntimeEndpointChanged, getRuntimeKey } from '@/lib/runtime-switch';
import { subscribePanelWorkspaceOwner, sessionPanelOwner, getPanelWorkspaceOwner, PanelWorkspaceOwnerContext } from '@/lib/workspace/panelOwner';
import { getFilesViewTabsStore, deleteFilesViewTabsWorkspace, adoptLegacyFilesViewTabs } from './useFilesViewTabsStore';
import { closeContextPanelTabs } from './ui/contextPanelState';
import { buildContextPanelTabID } from './ui/contextTabs';
import { create, useStore, type StoreApi } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { PANEL_WORKSPACE_FIELDS, type UIStore, type PanelWorkspaceState, type PanelSetter } from './ui/types';
import { uiStorePersistOptions } from './ui/persistence';
import { createInitialUIState } from './ui/initialState';
import { createAppearanceActions } from './ui/appearanceActions';
import { createWorkspaceActions } from './ui/workspaceActions';
import { createPanelActions } from './ui/contextTabActions';
import { createNavigationActions } from './ui/navigationActions';
import { createPreferenceActions } from './ui/preferenceActions';
import { createModelActions } from './ui/modelActions';
import { createNotificationActions } from './ui/notificationActions';
import { createAgentActions } from './ui/agentActions';

export type { PendingDiffScope } from './ui/types';
export { clampContextEditorTreeWidth } from './ui/preferences';
export type { SessionRetentionAction } from './ui/types';
export type { TimeFormatPreference } from './ui/types';
export type { MobileKeepScreenAwake } from './ui/types';
export type { FileEditorKeymap } from './ui/types';
export type { LargeTextPasteBehavior } from './ui/types';
export type { ChatWidth } from './ui/types';
export type { SessionGoalChecker } from './ui/types';
export { normalizeContextPanelDirectoryKey } from './ui/contextTabs';
export { isTrackerBranchTab } from './ui/contextTabs';
export { DEFAULT_SELECTION_APPROVAL_TEXT } from './ui/preferences';
export { DEFAULT_TERMINAL_FONT_SIZE, DEFAULT_SPACING_SCALE, DEFAULT_EDITOR_FONT_SIZE } from './ui/preferences';
export { DEFAULT_CONTEXT_EDITOR_TREE_WIDTH } from './ui/preferences';
export type { ContextPanelMode } from '@/lib/surfaces/modes';

const useGlobalUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get, store) => ({
        ...createInitialUIState(),
        ...createAppearanceActions(set, get, store),
        ...createWorkspaceActions(set, get, store),
        ...createPanelActions(
          (update) => getPanelWorkspaceUI(getPanelWorkspaceOwner()).setState(update),
          () => getPanelWorkspaceUI(getPanelWorkspaceOwner()).getState(),
        ),
        ...createNavigationActions(set, get, store),
        ...createPreferenceActions(set, get, store),
        ...createModelActions(set, get, store),
        ...createNotificationActions(set, get, store),
        ...createAgentActions(set, get, store),
      }),
      uiStorePersistOptions,
    ),
    { name: 'ui-store' },
  ),
);

const EMPTY_PANEL_WORKSPACE: PanelWorkspaceState = {
  contextPanelByDirectory: {},
  contextTerminalTabs: {},
  contextPanelHostDirectory: null,
  contextEditorTreeVisible: false,
  contextEditorVisible: true,
  pendingDiffFile: null,
  pendingDiffStaged: false,
  pendingDiffScope: null,
  pendingTurnDiffFile: null,
  pendingFileNavigation: null,
  pendingFileFocusPath: null,
};

const workspaceFields = new Set<string>(PANEL_WORKSPACE_FIELDS);
const workspaceApis = new Map<string, StoreApi<UIStore>>();

/** Panel actions capture their owner. Resource directories remain ordinary paths. */
export function getPanelWorkspaceUI(owner: string): StoreApi<UIStore> {
  const canonical = useGlobalUIStore.getState().panelWorkspaceAliases[owner] ?? owner;
  const existing = workspaceApis.get(canonical);
  if (existing) return existing;

  let previousRoot: UIStore | undefined;
  let snapshot: UIStore;
  const getState = (): UIStore => {
    const root = useGlobalUIStore.getState();
    if (root !== previousRoot) {
      previousRoot = root;
      snapshot = { ...root, ...(root.panelWorkspaces[canonical] ?? EMPTY_PANEL_WORKSPACE), ...actions, panelWorkspaceOwnerId: canonical };
    }
    return snapshot;
  };
  const set: PanelSetter = (update) => {
    const current = getState();
    const value = update instanceof Function ? update(current) : update;
    if (value === current) return;
    const scoped = Object.fromEntries(Object.entries(value).filter(([key]) => workspaceFields.has(key)));
    const shared = Object.fromEntries(Object.entries(value).filter(([key]) => !workspaceFields.has(key)));
    useGlobalUIStore.setState((root) => {
      const next: Partial<UIStore> = { ...shared };
      if (Object.keys(scoped).length) {
        next.panelWorkspaces = {
          ...(value.panelWorkspaces ?? root.panelWorkspaces),
          [canonical]: { ...(value.panelWorkspaces?.[canonical] ?? root.panelWorkspaces[canonical] ?? EMPTY_PANEL_WORKSPACE), ...scoped },
        };
      }
      return next;
    });
  };
  const actions = createPanelActions(set, getState);
  const api: StoreApi<UIStore> = {
    getState,
    getInitialState: getState,
    setState: (update) => set(update),
    subscribe: (listener) => {
      let previous = getState();
      return useGlobalUIStore.subscribe(() => {
        const next = getState();
        const before = previous;
        previous = next;
        listener(next, before);
      });
    },
  };
  workspaceApis.set(canonical, api);
  return api;
}

const mainWorkspaceApi: StoreApi<UIStore> = {
  getState: () => getPanelWorkspaceUI(getPanelWorkspaceOwner()).getState(),
  getInitialState: () => ({ ...useGlobalUIStore.getInitialState(), ...EMPTY_PANEL_WORKSPACE }),
  setState: (update) => getPanelWorkspaceUI(getPanelWorkspaceOwner()).setState(update),
  subscribe: (listener) => {
    let previous = mainWorkspaceApi.getState();
    const changed = () => {
      const next = mainWorkspaceApi.getState();
      if (next === previous) return;
      const before = previous;
      previous = next;
      listener(next, before);
    };
    const root = useGlobalUIStore.subscribe(changed);
    const selection = subscribePanelWorkspaceOwner(changed);
    const runtime = subscribeRuntimeEndpointChanged(changed);
    return () => { root(); selection(); runtime(); };
  },
};

export const useUIStore = Object.assign(
  function useUIStore<T>(selector: (state: UIStore) => T): T {
    const owner = useContext(PanelWorkspaceOwnerContext);
    return useStore(owner ? getPanelWorkspaceUI(owner) : mainWorkspaceApi, selector);
  },
  mainWorkspaceApi,
  { persist: useGlobalUIStore.persist },
);

export const usePanelWorkspaceApi = (): StoreApi<UIStore> =>
  getPanelWorkspaceUI(useUIStore((state) => state.panelWorkspaceOwnerId));

export function setPanelWorkspaceDirectory(owner: string, directory: string): void {
  const api = getPanelWorkspaceUI(owner);
  const state = api.getState();
  const previous = state.contextPanelHostDirectory;
  if (previous === directory) return;
  const panels = { ...state.contextPanelByDirectory };
  if (previous && panels[previous]) {
    panels[directory] = panels[previous];
    delete panels[previous];
  }
  api.setState({ contextPanelHostDirectory: directory, contextPanelByDirectory: panels });
}

export function adoptLegacyPanelWorkspace(owner: string, directory: string): void {
  const root = useGlobalUIStore.getState();
  const panel = root.contextPanelByDirectory[directory];
  if (!panel) return;
  const { [directory]: legacy, ...remaining } = root.contextPanelByDirectory;
  const api = getPanelWorkspaceUI(owner);
  const remapped = new Map<string, string>();
  const tabs = legacy.tabs.map((tab) => {
    if (tab.mode !== 'browser') return tab;
    const dedupeKey = `${api.getState().panelWorkspaceOwnerId}\u0000${tab.dedupeKey}`;
    const id = buildContextPanelTabID('browser', dedupeKey);
    remapped.set(tab.id, id);
    return { ...tab, id, dedupeKey };
  });
  let adopted = { ...legacy, tabs };
  for (const zone of CONTEXT_ZONES) {
    const view = getZoneView(adopted, zone);
    const activeTabId = view.activeTabId ? remapped.get(view.activeTabId) : undefined;
    if (activeTabId) adopted = withZoneView(adopted, zone, { activeTabId });
  }
  if (!api.getState().contextPanelByDirectory[directory]) {
    const contextTerminalTabs = { ...api.getState().contextTerminalTabs };
    for (const tab of adopted.tabs) {
      if (tab.mode !== 'terminal') continue;
      const resourceDirectory = tab.targetDirectory ?? directory;
      if (contextTerminalTabs[resourceDirectory]) continue;
      const terminals = useTerminalStore.getState().getDirectoryState(resourceDirectory);
      contextTerminalTabs[resourceDirectory] = {
        tabIds: terminals?.tabs.map((terminal) => terminal.id) ?? [],
        activeTabId: terminals?.activeTabId ?? null,
        serverSessionIds: Object.fromEntries(terminals?.tabs.flatMap((terminal) => terminal.terminalSessionId ? [[terminal.id, terminal.terminalSessionId]] : []) ?? []),
        legacyAdoptionPending: true,
      };
    }
    api.setState({
      contextPanelByDirectory: { ...api.getState().contextPanelByDirectory, [directory]: adopted },
      contextTerminalTabs,
      contextEditorTreeVisible: root.contextEditorTreeVisible,
      contextEditorVisible: root.contextEditorVisible,
    });
  }
  useGlobalUIStore.setState({ contextPanelByDirectory: remaining });
  adoptLegacyFilesViewTabs(owner, directory);
}

export function adoptDraftPanelWorkspace(draftOwner: string, sessionOwner: string): void {
  const root = useGlobalUIStore.getState();
  if (root.panelWorkspaceAliases[sessionOwner]) return;
  useGlobalUIStore.setState({ panelWorkspaceAliases: { ...root.panelWorkspaceAliases, [sessionOwner]: draftOwner } });
}

export function deletePanelWorkspace(owner: string): void {
  const root = useGlobalUIStore.getState();
  const canonical = root.panelWorkspaceAliases[owner] ?? owner;
  const workspaces = Object.fromEntries(Object.entries(root.panelWorkspaces).map(([host, workspace]) => {
    const runtime = JSON.parse(host)[0];
    const contextPanelByDirectory = Object.fromEntries(Object.entries(workspace.contextPanelByDirectory).map(([directory, panel]) => {
      const ids = panel.tabs.filter((tab) => tab.mode === 'chat' && tab.dedupeKey.startsWith('session:') && sessionPanelOwner(tab.dedupeKey.slice('session:'.length), runtime) === owner).map((tab) => tab.id);
      return [directory, ids.length ? closeContextPanelTabs(panel, ids, root.contextSurfaceZones) : panel];
    }));
    return [host, { ...workspace, contextPanelByDirectory }];
  }));
  delete workspaces[canonical];
  const aliases = Object.fromEntries(Object.entries(root.panelWorkspaceAliases).filter(([key, value]) => key !== owner && value !== canonical));
  workspaceApis.delete(canonical);
  deleteFilesViewTabsWorkspace(canonical);
  useGlobalUIStore.setState({ panelWorkspaces: workspaces, panelWorkspaceAliases: aliases });
}

/** The displayed main session owns its resources; a side chat uses the workspace holding its tab. */
export function panelOwnerForSession(sessionId: string, displayedOwner: string): string {
  const root = useGlobalUIStore.getState();
  const runtime = getRuntimeKey();
  const key = sessionPanelOwner(sessionId, runtime);
  const ownWorkspace = root.panelWorkspaceAliases[key] ?? key;
  const displayedWorkspace = root.panelWorkspaceAliases[displayedOwner] ?? displayedOwner;
  if (ownWorkspace === displayedWorkspace) return ownWorkspace;
  let owner = ownWorkspace;
  let touchedAt = -Infinity;
  for (const [host, workspace] of Object.entries(root.panelWorkspaces)) {
    if (JSON.parse(host)[0] !== runtime) continue;
    for (const panel of Object.values(workspace.contextPanelByDirectory)) {
      for (const tab of panel.tabs) {
        if (tab.mode !== 'chat' || tab.dedupeKey !== `session:${sessionId}`) continue;
        if (host === displayedWorkspace) return host;
        if (tab.touchedAt > touchedAt) {
          owner = host;
          touchedAt = tab.touchedAt;
        }
      }
    }
  }
  return owner;
}

export function forgetPanelWorkspaceLayouts(): void {
  const root = useGlobalUIStore.getState();
  for (const owner of Object.keys(root.panelWorkspaces)) {
    const ui = getPanelWorkspaceUI(owner).getState();
    getFilesViewTabsStore(owner).setState({ byRoot: {}, runtimeSnapshots: {} });
    for (const directory of Object.keys(ui.contextPanelByDirectory)) {
      for (const zone of CONTEXT_ZONES) ui.closeContextZone(directory, zone);
    }
  }
  useGlobalUIStore.setState({ contextPanelByDirectory: {} });
}
