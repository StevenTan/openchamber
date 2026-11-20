import { useI18nStore, formatMessage } from '@/lib/i18n';
import { toast } from 'sonner';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { getFilesViewTabsStore } from '../useFilesViewTabsStore';
import { confirmSideChatClose } from '@/components/layout/sideChatCloseConfirmation';
import type { PanelSetter, PanelActionName, ContextPanelTab, ContextPanelDirectoryState, UIStore } from './types';
import { CONTEXT_ZONES, getZoneView, resolveZoneActiveTabId, withZoneView, zoneOfMode } from '@/lib/workspace/zones';
import { directoryMayHaveActiveProjectAction, useTerminalStore } from '@/stores/useTerminalStore';

import { isVSCodeRuntime } from '@/lib/desktop';
import { noteBrowserTabOpenedWithAddress, requestBrowserTabLoad } from '@/lib/browser/devServerWait';
import { normalizeDirectoryPath, normalizeContextTargetPath, normalizeContextTargetDirectory, contextPanelModeKeepsTargetDirectory, isTrackerBranchTab, normalizePendingDiffScope, normalizeContextPanelTabDedupeKey, buildContextPanelTabID } from './contextTabs';
import { touchContextPanelState, upsertContextPanelTab, closeContextPanelTabs, reorderContextPanelTabs, setContextPanelTabTargetPath, moveContextPanelFileTabs, clampContextPanelRoots } from './contextPanelState';

let browserTabSequence = 0;

const noteBrowserTabAddressRequested = (
  byDirectory: Record<string, ContextPanelDirectoryState>,
  directory: string,
  dedupeKey: string,
  url: string,
): void => {
  const tabID = buildContextPanelTabID('browser', dedupeKey);
  if (byDirectory[directory]?.tabs.some((tab) => tab.id === tabID)) {
    requestBrowserTabLoad(directory, tabID, url);
    return;
  }
  noteBrowserTabOpenedWithAddress(directory, tabID);
};

const openFileTab = (state: UIStore, directory: string, filePath: string, preview: boolean) => {
  const tabs = state.contextPanelByDirectory[directory]?.tabs ?? [];
  const replacedPreviewPath = preview
    ? tabs.find((tab) => tab.preview && tab.targetPath !== filePath)?.targetPath ?? null
    : null;
  const alreadyOpen = tabs.some((tab) => tab.mode === 'file' && tab.targetPath === filePath);
  state.openContextPanelTab(directory, { mode: 'file', targetPath: filePath, preview });
  if (replacedPreviewPath && !alreadyOpen) {
    getFilesViewTabsStore(state.isMobile || isVSCodeRuntime() ? undefined : state.panelWorkspaceOwnerId).getState().removeOpenPath(directory, replacedPreviewPath);
  }
};

export function createPanelActions(set: PanelSetter, get: () => UIStore): Pick<UIStore, PanelActionName> {
  const panelRoot = (directory: string): string => normalizeDirectoryPath((get().contextPanelHostDirectory ?? directory).trim());
  const browserKey = (key: string): string => {
    const prefix = `${get().panelWorkspaceOwnerId}\u0000`;
    return key.startsWith(prefix) ? key : `${prefix}${key}`;
  };
  return {
        // The editor and the tree can each be hidden, never both at once:
        // hiding one while the other is hidden brings the other back.
        toggleContextEditorTree: () => {
          set((state) => (state.contextEditorTreeVisible && !state.contextEditorVisible
            ? { contextEditorTreeVisible: false, contextEditorVisible: true }
            : { contextEditorTreeVisible: !state.contextEditorTreeVisible }));
        },

        toggleContextEditor: () => {
          set((state) => (state.contextEditorVisible && !state.contextEditorTreeVisible
            ? { contextEditorVisible: false, contextEditorTreeVisible: true }
            : { contextEditorVisible: !state.contextEditorVisible }));
        },

        // Rail entry point: activates the most recent tab of the requested
        // mode, opens a fresh singleton tab when none exists, and toggles the
        // panel closed when the requested mode is already active and visible.
        openContextSurface: (directory, mode) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory) {
            return;
          }

          const state = get();
          const placement = state.contextSurfaceZones;
          const panelState = state.contextPanelByDirectory[normalizedDirectory];
          const tabs = panelState?.tabs ?? [];
          const zone = zoneOfMode(placement, mode);
          const zoneView = panelState ? getZoneView(panelState, zone) : null;
          const activeTabId = resolveZoneActiveTabId(tabs, placement, zone, zoneView?.activeTabId ?? null);
          const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
          const clearTerminalTarget = () => {
            if (mode === 'terminal') {
              const terminalTab = tabs.find((tab) => tab.mode === 'terminal') ?? null;
              const targetDirectory = terminalTab?.targetDirectory ?? null;
              if (targetDirectory) {
                const targetState = useTerminalStore.getState().getDirectoryState(targetDirectory);
                if (directoryMayHaveActiveProjectAction(targetState)) {
                  return;
                }
              }
              state.openContextPanelTab(normalizedDirectory, { mode: 'terminal', targetDirectory: null }, { reveal: false });
            }
          };

          if (zoneView?.isOpen && activeTab?.mode === mode) {
            clearTerminalTarget();
            state.closeContextZone(normalizedDirectory, zone);
            return;
          }

          // A hidden tree stays hidden while a file is open, so the editor
          // shows alone. With no file open the tree is all the surface has,
          // and it comes back.
          if (mode === 'file' && !state.contextEditorTreeVisible
            && !tabs.some((tab) => tab.mode === 'file' && tab.targetPath)) {
            set({ contextEditorTreeVisible: true });
          }

          const tabsOfMode = tabs.filter((tab) => tab.mode === mode);
          if (tabsOfMode.length > 0) {
            clearTerminalTarget();
            // `>=` so equal timestamps (same-millisecond opens) resolve to the
            // later tab in insertion order.
            const mostRecent = tabsOfMode.reduce((best, tab) => (tab.touchedAt >= best.touchedAt ? tab : best));
            // The rail's Changes and walkthrough are this project's: a pull
            // request of another project opened from the Tracker gives way.
            if ((mode === 'diff' || mode === 'walkthrough') && mostRecent.targetDirectory) {
              state.openContextPanelTab(normalizedDirectory, {
                mode,
                targetPath: mostRecent.targetPath,
                stagedDiff: mostRecent.stagedDiff,
                diffScope: mostRecent.diffScope,
                targetDirectory: null,
              });
              return;
            }
            state.setActiveContextPanelTab(normalizedDirectory, mostRecent.id);
            return;
          }

          // Content-driven modes need a payload (a session to split); the rail
          // renders them disabled until content exists. 'file' opens an empty
          // editor whose embedded tree picks the first file.
          if (mode === 'chat') {
            return;
          }

          state.openContextPanelTab(normalizedDirectory, { mode });
        },

        openContextPanelTab: (directory, tab, options) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory) {
            return;
          }

          if (tab.mode === 'browser') {
            tab = { ...tab, dedupeKey: browserKey(normalizeContextPanelTabDedupeKey(tab.mode, tab.targetPath ?? null, tab.dedupeKey)) };
          }
          // Working in the panel's own directory is the default, stored as no target.
          const nextTab = tab.mode !== 'chat' && contextPanelModeKeepsTargetDirectory(tab.mode)
            ? {
                ...tab,
                targetDirectory: normalizeContextTargetDirectory(tab.targetDirectory === undefined ? directory : tab.targetDirectory) === normalizedDirectory
                  ? null
                  : normalizeContextTargetDirectory(tab.targetDirectory === undefined ? directory : tab.targetDirectory),
              }
            : tab;

          // Revealing a real file shows it, even if the editor was hidden.
          const showsFile = nextTab.mode === 'file' && Boolean(nextTab.targetPath) && options?.reveal !== false;

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev, state.contextSurfaceZones);
            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: upsertContextPanelTab(current, nextTab, state.contextSurfaceZones, options),
            };

            return {
              contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20),
              contextEditorVisible: showsFile || state.contextEditorVisible,
            };
          });
        },

        openTrackerItem: (directory, item) => {
          const normalizedDirectory = panelRoot(directory);
          const url = item.url.trim();
          if (!normalizedDirectory || !url) {
            return null;
          }

          const dedupeKey = `tracker:${item.key}`;
          const targetDirectory = normalizeContextTargetDirectory(item.targetDirectory);
          set((state) => {
            const placement = state.contextSurfaceZones;
            const current = touchContextPanelState(state.contextPanelByDirectory[normalizedDirectory], placement);
            // An item never shows without the branch's own tab beside it.
            const withBranch = current.tabs.some(isTrackerBranchTab)
              ? current
              : upsertContextPanelTab(current, { mode: 'pr' }, placement, { reveal: false });
            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: upsertContextPanelTab(withBranch, {
                mode: 'pr',
                targetPath: url,
                dedupeKey,
                label: item.label,
                targetDirectory: targetDirectory === normalizedDirectory ? null : targetDirectory,
              }, placement),
            };
            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
          return buildContextPanelTabID('pr', dedupeKey);
        },

        openContextDiff: (directory, filePath, staged = false, scope = null) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedFilePath = (filePath || '').trim();
          if (!normalizedDirectory || !normalizedFilePath) {
            return;
          }

          const diffScope = normalizePendingDiffScope(scope) ?? (staged ? 'staged' : 'working');

          get().openContextPanelTab(directory, {
            mode: 'diff',
            targetPath: normalizedFilePath,
            stagedDiff: diffScope === 'staged',
            diffScope,
          });
        },

        openContextFile: (directory, filePath, options) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedFilePath = normalizeContextTargetPath(filePath);
          if (!normalizedDirectory || !normalizedFilePath) {
            return;
          }

          openFileTab(get(), normalizedDirectory, normalizedFilePath, options?.preview === true);
          get().setPendingFileFocusPath(normalizedFilePath);
          get().setPendingFileNavigation(null);
          if (options?.expanded) {
            const zone = zoneOfMode(get().contextSurfaceZones, 'file');
            const panel = get().contextPanelByDirectory[normalizedDirectory];
            if (panel && !getZoneView(panel, zone).expanded) {
              get().toggleContextPanelExpanded(normalizedDirectory, zone);
            }
          }
        },

        openContextFileAtLine: (directory, filePath, line, column, options) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedFilePath = normalizeContextTargetPath(filePath);
          const normalizedLine = Number.isFinite(line) ? Math.max(1, Math.trunc(line)) : 1;
          const normalizedColumn = Number.isFinite(column) ? Math.max(1, Math.trunc(column as number)) : 1;
          if (!normalizedDirectory || !normalizedFilePath) {
            return;
          }

          openFileTab(get(), normalizedDirectory, normalizedFilePath, options?.preview === true);
          get().setPendingFileFocusPath(null);
          get().setPendingFileNavigation({
            path: normalizedFilePath,
            line: normalizedLine,
            column: normalizedColumn,
          });
        },

        openContextOverview: (directory) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory) {
            return;
          }

          get().openContextPanelTab(directory, { mode: 'context' });
        },

        openContextPreview: (directory, url) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedUrl = (url || '').trim();
          if (!normalizedDirectory || !normalizedUrl || isVSCodeRuntime()) {
            return;
          }

          noteBrowserTabAddressRequested(get().contextPanelByDirectory, normalizedDirectory, browserKey(normalizedUrl), normalizedUrl);
          // No stored label: a browser tab is named after wherever it has
          // navigated to, which the panel derives from targetPath.
          get().openContextPanelTab(directory, {
            mode: 'browser',
            targetPath: normalizedUrl,
            dedupeKey: normalizedUrl,
            label: null,
          });
        },
        // An agent's page gets its own tab in the background: never the tab
        // the user is on, never an existing tab that happens to show the same
        // address, and the panel stays as the user left it.
        openAgentBrowserTab: (directory, url, ownerSessionId) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory || isVSCodeRuntime()) return null;
          browserTabSequence += 1;
          const dedupeKey = browserKey(`browser:agent:${Date.now()}-${browserTabSequence}`);
          if (url.trim()) noteBrowserTabAddressRequested(get().contextPanelByDirectory, normalizedDirectory, dedupeKey, url.trim());
          get().openContextPanelTab(directory, {
            mode: 'browser',
            targetPath: url.trim(),
            dedupeKey,
            label: null,
            ownerSessionId,
          }, { reveal: false });
          return buildContextPanelTabID('browser', dedupeKey);
        },
        // Always a new tab, never the existing one: the whole point of asking
        // for one is to keep what is already open.
        openNewContextBrowserTab: (directory) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory || isVSCodeRuntime()) return;
          browserTabSequence += 1;
          get().openContextPanelTab(directory, {
            mode: 'browser',
            targetPath: '',
            dedupeKey: `browser:new:${Date.now()}-${browserTabSequence}`,
            label: null,
          });
        },
        openContextBrowser: (directory, url = '', options) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory || isVSCodeRuntime()) return;
          const targetUrl = typeof url === 'string' && url.trim().length > 0 ? url.trim() : '';
          if (targetUrl) noteBrowserTabAddressRequested(get().contextPanelByDirectory, normalizedDirectory, browserKey(targetUrl), targetUrl);
          get().openContextPanelTab(directory, {
            mode: 'browser',
            targetPath: targetUrl,
            dedupeKey: targetUrl || 'browser',
            label: null,
          }, options);
        },

        setContextPanelTabTargetPath: (directory, tabID, targetPath) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedTabID = (tabID || '').trim();
          if (!normalizedDirectory || !normalizedTabID) return;
          set((state) => {
            const current = state.contextPanelByDirectory[normalizedDirectory];
            if (!current) return state;
            return {
              contextPanelByDirectory: {
                ...state.contextPanelByDirectory,
                [normalizedDirectory]: setContextPanelTabTargetPath(current, normalizedTabID, targetPath),
              },
            };
          });
        },

        moveContextFilePaths: (directory, fromPath, toPath, filesRoot = directory) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedFrom = normalizeContextTargetPath(fromPath);
          const normalizedTo = normalizeContextTargetPath(toPath);
          if (!normalizedDirectory || !normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) return;
          set((state) => {
            const current = state.contextPanelByDirectory[normalizedDirectory];
            if (!current) return state;
            const next = moveContextPanelFileTabs(current, normalizedFrom, normalizedTo);
            if (next === current) return state;
            return {
              contextPanelByDirectory: {
                ...state.contextPanelByDirectory,
                [normalizedDirectory]: next,
              },
            };
          });
          getFilesViewTabsStore(get().isMobile || isVSCodeRuntime() ? undefined : get().panelWorkspaceOwnerId).getState().movePaths(normalizeDirectoryPath(filesRoot.trim()), normalizedFrom, normalizedTo);
        },

        setActiveContextPanelTab: (directory, tabID) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedTabID = (tabID || '').trim();
          if (!normalizedDirectory || !normalizedTabID) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev, state.contextSurfaceZones);
            const targetTab = current.tabs.find((tab) => tab.id === normalizedTabID);
            if (!targetTab) {
              return state;
            }

            // Picking a file tab shows its editor, even if the editor was hidden.
            const showsFile = targetTab.mode === 'file' && Boolean(targetTab.targetPath);
            const zone = zoneOfMode(state.contextSurfaceZones, targetTab.mode);
            const view = getZoneView(current, zone);

            if (view.activeTabId === normalizedTabID && view.isOpen) {
              return showsFile ? { contextEditorVisible: true } : state;
            }

            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: withZoneView({
                ...current,
                touchedAt: Date.now(),
                tabs: current.tabs.map((tab) => (tab.id === normalizedTabID
                  ? { ...tab, touchedAt: Date.now() }
                  : tab)),
              }, zone, { isOpen: true, activeTabId: normalizedTabID }),
            };

            return {
              contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20),
              contextEditorVisible: showsFile || state.contextEditorVisible,
            };
          });
        },

        reorderContextPanelTabs: (directory, activeTabID, overTabID) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedActiveTabID = (activeTabID || '').trim();
          const normalizedOverTabID = (overTabID || '').trim();
          if (!normalizedDirectory || !normalizedActiveTabID || !normalizedOverTabID) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev, state.contextSurfaceZones);
            if (!current.tabs.some((tab) => tab.id === normalizedActiveTabID) || !current.tabs.some((tab) => tab.id === normalizedOverTabID)) {
              return state;
            }

            const next = reorderContextPanelTabs(current, normalizedActiveTabID, normalizedOverTabID);
            if (next.tabs === current.tabs) {
              return state;
            }

            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: next,
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        pinContextPanelTab: (directory, tabID) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory) return;
          set((state) => {
            const current = state.contextPanelByDirectory[normalizedDirectory];
            if (!current?.tabs.some((tab) => tab.id === tabID && tab.preview)) return state;
            return {
              contextPanelByDirectory: {
                ...state.contextPanelByDirectory,
                [normalizedDirectory]: {
                  ...current,
                  tabs: current.tabs.map((tab) => (tab.id === tabID ? { ...tab, preview: false } : tab)),
                },
              },
            };
          });
        },

        closeContextPanelTab: (directory, tabID) => {
          get().closeContextPanelTabs(directory, [tabID]);
        },

        closeContextFile: (directory, filePath) => {
          const normalizedDirectory = panelRoot(directory);
          const normalizedFilePath = normalizeContextTargetPath(filePath);
          if (!normalizedDirectory || !normalizedFilePath) {
            return;
          }
          const tab = get().contextPanelByDirectory[normalizedDirectory]?.tabs
            .find((candidate) => candidate.mode === 'file' && candidate.targetPath === normalizedFilePath);
          if (tab) {
            get().closeContextPanelTabs(normalizedDirectory, [tab.id]);
            return;
          }
          // No tab shows it (the strip was already out of step): the editor's
          // own open files still drop it.
          getFilesViewTabsStore(get().isMobile || isVSCodeRuntime() ? undefined : get().panelWorkspaceOwnerId).getState().removeOpenPath(normalizedDirectory, normalizedFilePath);
        },

        closeContextPanelTabs: (directory, tabIds) => {
          const normalizedDirectory = panelRoot(directory);
          // The Tracker's branch tab stays: closing every item leaves it.
          const branchTabIds = new Set((get().contextPanelByDirectory[normalizedDirectory]?.tabs ?? [])
            .filter(isTrackerBranchTab)
            .map((tab) => tab.id));
          const normalizedTabIds = (tabIds ?? [])
            .map((id) => (id || '').trim())
            .filter((id) => id.length > 0 && !branchTabIds.has(id));
          if (!normalizedDirectory || normalizedTabIds.length === 0) {
            return;
          }

          const closedTabs = normalizedTabIds
            .map((id) => get().contextPanelByDirectory[normalizedDirectory]?.tabs.find((tab) => tab.id === id))
            .filter((tab): tab is ContextPanelTab => Boolean(tab));

          const commitClose = (tabs: typeof closedTabs) => {
            const closingIds = tabs.map((tab) => tab.id);
            set((state) => {
              const placement = state.contextSurfaceZones;
              const prev = state.contextPanelByDirectory[normalizedDirectory];
              const current = touchContextPanelState(prev, placement);
              if (!current.tabs.some((tab) => closingIds.includes(tab.id))) {
                return state;
              }

              const next = closeContextPanelTabs(current, closingIds, placement);
              const byDirectory = {
                ...state.contextPanelByDirectory,
                [normalizedDirectory]: next,
              };

              return {
                contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20),
              };
            });

            // Keep the editor's own open-file state in sync so closed files do not
            // resurrect when the editor surface reopens.
            for (const tab of tabs) {
              if (tab.mode === 'file' && tab.targetPath) {
                getFilesViewTabsStore(get().isMobile || isVSCodeRuntime() ? undefined : get().panelWorkspaceOwnerId).getState().removeOpenPath(normalizedDirectory, tab.targetPath);
              }
            }
          };
          if (!closedTabs.some((tab) => tab.mode === 'chat' && tab.discardOnClose)) {
            commitClose(closedTabs);
            return;
          }
          const runtime = getRuntimeKey();
          void import('@/lib/sideChats').then(async ({ discardSideChat, getSideChatsForClose }) => {
            const candidates = await Promise.all(closedTabs.map(async (tab) => {
              try {
                const sessions = tab.mode === 'chat' && tab.discardOnClose && tab.dedupeKey.startsWith('session:')
                  ? await getSideChatsForClose(tab.dedupeKey.slice('session:'.length), tab.targetDirectory ?? normalizedDirectory, runtime)
                  : [];
                return { tab, sessions };
              } catch (error) {
                if (getRuntimeKey() === runtime) toast.error(formatMessage(useI18nStore.getState().dictionary, 'contextPanel.chat.closeFailed'), {
                  description: error instanceof Error ? error.message : String(error),
                });
                return null;
              }
            }));
            if (getRuntimeKey() !== runtime) return;
            const temporary = [...new Map(candidates.flatMap((candidate) => candidate?.sessions ?? []).map((session) => [session.id, session])).values()];
            if (temporary.length && !await confirmSideChatClose(temporary)) return;
            if (getRuntimeKey() !== runtime) return;
            const confirmedSessionIDs = new Set(temporary.map((session) => session.id));
            const results = await Promise.all(candidates.map(async (candidate) => {
              if (!candidate) return null;
              const { tab } = candidate;
              if (tab.mode !== 'chat' || !tab.discardOnClose || !tab.dedupeKey.startsWith('session:')) return tab;
              try {
                await discardSideChat(tab.dedupeKey.slice('session:'.length), tab.targetDirectory ?? normalizedDirectory, runtime, confirmedSessionIDs);
                return tab;
              } catch (error) {
                if (getRuntimeKey() === runtime) toast.error(formatMessage(useI18nStore.getState().dictionary, 'contextPanel.chat.closeFailed'), {
                  description: error instanceof Error ? error.message : String(error),
                });
                return null;
              }
            }));
            if (getRuntimeKey() === runtime) commitClose(results.filter((tab): tab is ContextPanelTab => tab !== null));
          });
        },

        closeContextPanel: (directory) => {
          get().closeContextZone(directory, 'right');
        },

        closeContextZone: (directory, zone) => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            if (!prev || !getZoneView(prev, zone).isOpen) {
              return state;
            }

            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: withZoneView(touchContextPanelState(prev, state.contextSurfaceZones), zone, { isOpen: false }),
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        toggleContextPanelExpanded: (directory, zone = 'right') => {
          const normalizedDirectory = panelRoot(directory);
          if (!normalizedDirectory) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev, state.contextSurfaceZones);
            const expanded = !getZoneView(current, zone).expanded;
            let next = current;
            for (const other of CONTEXT_ZONES) {
              next = withZoneView(next, other, { expanded: other === zone ? expanded : false });
            }
            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: next,
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        setPendingDiffFile: (filePath, staged = false, scope = null) => {
          set({
            pendingDiffFile: filePath,
            pendingDiffStaged: filePath ? staged : false,
            pendingDiffScope: filePath ? scope : null,
          });
        },

        setPendingTurnDiffFile: (request) => {
          set({ pendingTurnDiffFile: request });
        },

        setPendingFileNavigation: (navigation) => {
          set({ pendingFileNavigation: navigation });
        },

        setPendingFileFocusPath: (path) => {
          set({ pendingFileFocusPath: path });
        },

        navigateToDiff: (filePath, staged = false, scope = null) => {
          set({ pendingDiffFile: filePath, pendingDiffStaged: staged, pendingDiffScope: scope });
        },

        consumePendingDiffFile: () => {
          const { pendingDiffFile } = get();
          if (pendingDiffFile) {
            set({ pendingDiffFile: null, pendingDiffStaged: false, pendingDiffScope: null });
          }
          return pendingDiffFile;
        },

  };
}
