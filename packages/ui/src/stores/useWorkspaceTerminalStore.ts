import { useContext } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { PanelWorkspaceOwnerContext } from '@/lib/workspace/panelOwner';
import { normalizeTerminalDirectory } from '@/lib/pathNormalization';
import { getPanelWorkspaceUI } from './useUIStore';
import { useTerminalStore, type TerminalStore } from './useTerminalStore';

type TerminalState = TerminalStore;
const apis = new Map<string, StoreApi<TerminalState>>();

function writeReferences(owner: string, directory: string, tabIds: string[], activeTabId: string | null, legacyAdoptionPending?: boolean): void {
  const ui = getPanelWorkspaceUI(owner);
  const key = normalizeTerminalDirectory(directory);
  const resources = useTerminalStore.getState().getDirectoryState(key);
  ui.setState((state) => {
    const previous = state.contextTerminalTabs[key];
    const serverSessionIds = Object.fromEntries(tabIds.flatMap((id) => {
      const resource = resources?.tabs.find((tab) => tab.id === id);
      const serverId = resource?.terminalSessionId ?? previous?.serverSessionIds?.[id];
      return serverId ? [[id, serverId]] : [];
    }));
    return { contextTerminalTabs: { ...state.contextTerminalTabs, [key]: {
      tabIds, activeTabId, serverSessionIds, legacyAdoptionPending: legacyAdoptionPending ?? previous?.legacyAdoptionPending,
    } } };
  });
}

export function attachWorkspaceTerminalTab(owner: string, directory: string, tabId: string): void {
  const current = getWorkspaceTerminalApi(owner).getState().getDirectoryState(directory);
  const ids = current?.tabs.map((tab) => tab.id) ?? [];
  writeReferences(owner, directory, ids.includes(tabId) ? ids : [...ids, tabId], tabId);
}

export function getWorkspaceTerminalApi(owner: string): StoreApi<TerminalState> {
  const ui = getPanelWorkspaceUI(owner);
  const canonical = ui.getState().panelWorkspaceOwnerId;
  const cached = apis.get(canonical);
  if (cached) return cached;
  let previousResources: TerminalState | undefined;
  let previousReferences: ReturnType<typeof ui.getState>['contextTerminalTabs'] | undefined;
  let snapshot: TerminalState;

  const attach = (directory: string, tabIds: string[], activeTabId: string | null) => writeReferences(canonical, directory, tabIds, activeTabId);
  const createTab = (directory: string): string => {
    const existing = ui.getState().contextTerminalTabs[normalizeTerminalDirectory(directory)]?.tabIds ?? [];
    const id = useTerminalStore.getState().createTab(directory);
    attach(directory, [...existing, id], id);
    return id;
  };
  const getState = (): TerminalState => {
    const resources = useTerminalStore.getState();
    const references = ui.getState().contextTerminalTabs;
    if (resources === previousResources && references === previousReferences) return snapshot;
    previousResources = resources;
    previousReferences = references;
    const directories = new Map<string, ReturnType<TerminalState['getDirectoryState']>>();
    snapshot = {
      ...resources,
      createTab,
      getDirectoryState: (directory) => {
        const key = normalizeTerminalDirectory(directory);
        if (directories.has(key)) return directories.get(key);
        const refs = references[key];
        const resource = resources.getDirectoryState(key);
        const resolve = (id: string) => {
          const serverId = refs?.serverSessionIds?.[id];
          const tab = resource?.tabs.find((entry) => entry.id === id || (serverId && entry.terminalSessionId === serverId));
          return tab && !tab.terminalSessionId && serverId ? { ...tab, terminalSessionId: serverId } : tab;
        };
        const tabs = refs?.tabIds.flatMap((id) => resolve(id) ?? []) ?? [];
        const active = refs?.activeTabId ? resolve(refs.activeTabId) : undefined;
        const state = tabs.length ? { tabs, activeTabId: active?.id ?? tabs[0].id } : undefined;
        directories.set(key, state);
        return state;
      },
      ensureDirectory: (directory) => {
        if (getState().getDirectoryState(directory)) return;
        const refs = ui.getState().contextTerminalTabs[normalizeTerminalDirectory(directory)];
        if (!Object.keys(refs?.serverSessionIds ?? {}).length) createTab(directory);
      },
      reconcileServerSessions: (directory, sessions, options) => {
        const key = normalizeTerminalDirectory(directory);
        for (const [ownerId, workspace] of Object.entries(ui.getState().panelWorkspaces)) {
          if (JSON.parse(ownerId)[0] !== JSON.parse(canonical)[0]) continue;
          for (const [id, serverId] of Object.entries(workspace.contextTerminalTabs[key]?.serverSessionIds ?? {})) {
            const tab = resources.getDirectoryState(key)?.tabs.find((entry) => entry.id === id);
            if (tab && tab.terminalSessionId === null) resources.setTabSessionId(key, id, serverId);
          }
        }
        useTerminalStore.getState().reconcileServerSessions(directory, sessions, options);
        if (ui.getState().contextTerminalTabs[key]?.legacyAdoptionPending) {
          const reserved = new Set(Object.entries(ui.getState().panelWorkspaces).flatMap(([id, workspace]) => id === canonical ? [] : [
            ...(workspace.contextTerminalTabs[key]?.tabIds ?? []), ...Object.values(workspace.contextTerminalTabs[key]?.serverSessionIds ?? {}),
          ]));
          const tabs = useTerminalStore.getState().getDirectoryState(key)?.tabs.filter((tab) => !reserved.has(tab.id) && (!tab.terminalSessionId || !reserved.has(tab.terminalSessionId))) ?? [];
          writeReferences(canonical, key, tabs.map((tab) => tab.id), tabs[0]?.id ?? null, false);
        } else {
          const refs = ui.getState().contextTerminalTabs[key];
          if (refs) {
            const live = useTerminalStore.getState().getDirectoryState(key)?.tabs ?? [];
            const kept = refs.tabIds.filter((id) => {
              const serverId = refs.serverSessionIds?.[id];
              return live.some((tab) => tab.id === id || (serverId && tab.terminalSessionId === serverId));
            });
            if (kept.length !== refs.tabIds.length) attach(key, kept, refs.activeTabId && kept.includes(refs.activeTabId) ? refs.activeTabId : kept[0] ?? null);
          }
        }
      },
      setTabSessionId: (directory, id, sessionId, options) => {
        resources.setTabSessionId(directory, id, sessionId, options);
        const key = normalizeTerminalDirectory(directory);
        const current = useTerminalStore.getState().getDirectoryState(key)?.tabs.find((tab) => tab.id === id);
        if (current?.terminalSessionId === null) {
          ui.setState((state) => {
            const refs = state.contextTerminalTabs[key];
            if (!refs) return state;
            const serverSessionIds = { ...refs.serverSessionIds };
            delete serverSessionIds[id];
            return { contextTerminalTabs: { ...state.contextTerminalTabs, [key]: { ...refs, serverSessionIds } } };
          });
        }
        const state = getState().getDirectoryState(directory);
        if (state) attach(directory, state.tabs.map((tab) => tab.id), state.activeTabId);
      },
      setActiveTab: (directory, id) => {
        const state = getState().getDirectoryState(directory);
        if (state?.tabs.some((tab) => tab.id === id)) attach(directory, state.tabs.map((tab) => tab.id), id);
      },
      moveTab: (directory, id, overId) => {
        const state = getState().getDirectoryState(directory);
        if (!state) return;
        const ordered = state.tabs.map((tab) => tab.id);
        const from = ordered.indexOf(id);
        const to = ordered.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return;
        ordered.splice(to, 0, ordered.splice(from, 1)[0]);
        attach(directory, ordered, state.activeTabId);
      },
      closeTab: (directory, id) => {
        const state = getState().getDirectoryState(directory);
        resources.closeTab(directory, id);
        if (!state) return;
        const remaining = state.tabs.filter((tab) => tab.id !== id).map((tab) => tab.id);
        attach(directory, remaining, state.activeTabId === id ? remaining[0] ?? null : state.activeTabId);
      },
    };
    return snapshot;
  };
  const api: StoreApi<TerminalState> = {
    getState,
    getInitialState: getState,
    setState: useTerminalStore.setState,
    subscribe: (listener) => {
      let previous = getState();
      const changed = () => {
        const next = getState();
        if (next === previous) return;
        const before = previous;
        previous = next;
        listener(next, before);
      };
      const resource = useTerminalStore.subscribe(changed);
      const navigation = ui.subscribe(changed);
      return () => { resource(); navigation(); };
    },
  };
  apis.set(canonical, api);
  return api;
}

export const useWorkspaceTerminalApi = () => {
  const owner = useContext(PanelWorkspaceOwnerContext);
  return owner ? getWorkspaceTerminalApi(owner) : useTerminalStore;
};

export const useWorkspaceTerminalStore = <T,>(selector: (state: TerminalState) => T): T =>
  useStore(useWorkspaceTerminalApi(), selector);
