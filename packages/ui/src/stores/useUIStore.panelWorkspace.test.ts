import { beforeEach, describe, expect, test } from 'bun:test';
import { sessionPanelOwner } from '@/lib/workspace/panelOwner';
import { adoptDraftPanelWorkspace, deletePanelWorkspace, getPanelWorkspaceUI, panelOwnerForSession, useUIStore } from './useUIStore';
import { getFilesViewTabsStore } from './useFilesViewTabsStore';
import { getWorkspaceTerminalApi } from './useWorkspaceTerminalStore';
import { useTerminalStore } from './useTerminalStore';

const ownerA = sessionPanelOwner('A', 'workspace-test');
const ownerB = sessionPanelOwner('B', 'workspace-test');
const directory = '/workspace-test';

beforeEach(() => {
  useUIStore.setState({ panelWorkspaces: {}, panelWorkspaceAliases: {}, contextSurfaceZones: {} });
  useTerminalStore.getState().clearAll();
});

describe('session panel workspaces', () => {
  test('sessions in the same directory keep separate tabs, visibility and pending navigation', () => {
    const a = getPanelWorkspaceUI(ownerA);
    const b = getPanelWorkspaceUI(ownerB);
    a.getState().openContextFileAtLine(directory, `${directory}/a.ts`, 12);
    a.getState().toggleContextEditorTree();
    b.getState().openContextFile(directory, `${directory}/b.ts`);
    b.getState().closeContextPanel(directory);
    expect(a.getState().contextPanelByDirectory[directory].tabs.map((tab) => tab.targetPath)).toEqual([`${directory}/a.ts`]);
    expect(b.getState().contextPanelByDirectory[directory].tabs.map((tab) => tab.targetPath)).toEqual([`${directory}/b.ts`]);
    expect(a.getState().contextPanelByDirectory[directory].isOpen).toBe(true);
    expect(b.getState().contextPanelByDirectory[directory].isOpen).toBe(false);
    expect(a.getState().contextEditorTreeVisible).toBe(false);
    expect(b.getState().contextEditorTreeVisible).toBe(true);
    expect(a.getState().pendingFileNavigation?.line).toBe(12);
    expect(b.getState().pendingFileNavigation).toBeNull();
  });

  test('an operation completing after another workspace opens keeps its captured owner', async () => {
    const openInA = getPanelWorkspaceUI(ownerA).getState().openContextFile;
    getPanelWorkspaceUI(ownerB).getState().openContextFile(directory, `${directory}/b.ts`);
    await Promise.resolve();
    openInA(directory, `${directory}/result.ts`);
    expect(getPanelWorkspaceUI(ownerA).getState().contextPanelByDirectory[directory].tabs[0].targetPath).toBe(`${directory}/result.ts`);
    expect(getPanelWorkspaceUI(ownerB).getState().contextPanelByDirectory[directory].tabs[0].targetPath).toBe(`${directory}/b.ts`);
  });

  test('zone placement and dimensions are shared while each workspace carries its own active tab', () => {
    const a = getPanelWorkspaceUI(ownerA);
    const b = getPanelWorkspaceUI(ownerB);
    a.getState().openContextSurface(directory, 'git');
    b.getState().openContextFile(directory, `${directory}/b.ts`);
    a.getState().setContextZoneSize('left', 320);
    a.getState().moveContextSurfaceToZone('git', 'left');
    expect(b.getState().contextZoneSizes.left).toBe(320);
    expect(a.getState().contextPanelByDirectory[directory].zones.left.activeTabId).toBe('git');
    expect(b.getState().contextPanelByDirectory[directory].activeTabId).toBe(`file:${directory}/b.ts`);
  });

  test('draft adoption keeps the same workspace identity and deletion leaves other sessions intact', () => {
    const draft = JSON.stringify(['workspace-test', 'draft', 'saved-draft']);
    const api = getPanelWorkspaceUI(draft);
    api.getState().openContextFile(directory, `${directory}/draft.ts`);
    adoptDraftPanelWorkspace(draft, ownerA);
    expect(getPanelWorkspaceUI(ownerA)).toBe(api);
    getPanelWorkspaceUI(ownerB).getState().openContextSurface(directory, 'git');
    deletePanelWorkspace(ownerA);
    expect(getPanelWorkspaceUI(ownerA).getState().contextPanelByDirectory).toEqual({});
    expect(getPanelWorkspaceUI(ownerB).getState().contextPanelByDirectory[directory].tabs[0].mode).toBe('git');
  });

  test('runtime identity separates sessions with matching IDs', () => {
    const other = sessionPanelOwner('A', 'another-runtime');
    getPanelWorkspaceUI(ownerA).getState().openContextSurface(directory, 'git');
    expect(getPanelWorkspaceUI(other).getState().contextPanelByDirectory).toEqual({});
  });

  test('file navigation and terminal selection follow their workspace while terminal resources stay alive', () => {
    const filesA = getFilesViewTabsStore(ownerA);
    const filesB = getFilesViewTabsStore(ownerB);
    filesA.getState().expandPath(directory, `${directory}/src`);
    expect(filesB.getState().byRoot[directory]).toBeUndefined();
    const terminalsA = getWorkspaceTerminalApi(ownerA);
    const terminalsB = getWorkspaceTerminalApi(ownerB);
    terminalsA.getState().ensureDirectory(directory);
    terminalsB.getState().ensureDirectory(directory);
    const idA = terminalsA.getState().getDirectoryState(directory)!.tabs[0].id;
    const idB = terminalsB.getState().getDirectoryState(directory)!.tabs[0].id;
    expect(idA).not.toBe(idB);
    expect(useTerminalStore.getState().getDirectoryState(directory)?.tabs.map((tab) => tab.id)).toEqual([idA, idB]);
    terminalsB.getState().closeTab(directory, idB);
    expect(terminalsA.getState().getDirectoryState(directory)?.tabs[0].id).toBe(idA);
  });

  test('server rediscovery restores the original owner without exposing its PTY to another session', () => {
    const a = getWorkspaceTerminalApi(ownerA);
    const b = getWorkspaceTerminalApi(ownerB);
    const id = a.getState().createTab(directory);
    a.getState().setTabSessionId(directory, id, 'pty-A');
    useTerminalStore.getState().clearAll();
    a.getState().ensureDirectory(directory);
    expect(getPanelWorkspaceUI(ownerA).getState().contextTerminalTabs[directory].serverSessionIds?.[id]).toBe('pty-A');
    b.getState().reconcileServerSessions(directory, [{ sessionId: 'pty-A', cwd: directory, status: 'running', createdAt: 1 }]);
    b.getState().ensureDirectory(directory);
    expect(a.getState().getDirectoryState(directory)?.tabs.map((tab) => tab.terminalSessionId)).toEqual(['pty-A']);
    expect(b.getState().getDirectoryState(directory)?.tabs.map((tab) => tab.terminalSessionId)).toEqual([null]);
  });

  test('terminal ordering belongs to the workspace references', () => {
    const a = getWorkspaceTerminalApi(ownerA);
    const first = a.getState().createTab(directory);
    const second = a.getState().createTab(directory);
    a.getState().moveTab(directory, second, first);
    expect(a.getState().getDirectoryState(directory)?.tabs.map((tab) => tab.id)).toEqual([second, first]);
  });

  test('discovery preserves a running terminal created after its server snapshot', () => {
    const a = getWorkspaceTerminalApi(ownerA);
    const id = a.getState().createTab(directory);
    a.getState().setTabSessionId(directory, id, 'new-pty');
    a.getState().reconcileServerSessions(directory, []);
    expect(a.getState().getDirectoryState(directory)?.tabs.map((tab) => tab.terminalSessionId)).toEqual(['new-pty']);
  });

  test('a saved chat opened as main owns its resources while its side tab remains available', () => {
    const host = sessionPanelOwner('host');
    const chat = sessionPanelOwner('side');
    getPanelWorkspaceUI(host).getState().openContextPanelTab(directory, { mode: 'chat', dedupeKey: 'session:side' });
    expect(panelOwnerForSession('side', host)).toBe(host);
    expect(panelOwnerForSession('side', chat)).toBe(chat);
    expect(panelOwnerForSession('side', host)).toBe(host);
  });

  test('closing a side tab releases its resource route and hiding the panel retains it', () => {
    const host = sessionPanelOwner('host');
    const ui = getPanelWorkspaceUI(host);
    ui.getState().openContextPanelTab(directory, { mode: 'chat', dedupeKey: 'session:side' });
    ui.getState().closeContextZone(directory, 'right');
    expect(panelOwnerForSession('side', sessionPanelOwner('other'))).toBe(host);
    ui.getState().closeContextPanelTab(directory, ui.getState().contextPanelByDirectory[directory].tabs[0].id);
    expect(panelOwnerForSession('side', host)).toBe(sessionPanelOwner('side'));
  });

  test('resource routing follows the displayed host and keeps runtime namespaces separate', () => {
    const first = sessionPanelOwner('first');
    const second = sessionPanelOwner('second');
    const foreign = sessionPanelOwner('foreign', 'another-runtime');
    for (const owner of [first, second, foreign]) {
      getPanelWorkspaceUI(owner).getState().openContextPanelTab(directory, { mode: 'chat', dedupeKey: 'session:side' });
    }
    expect(panelOwnerForSession('side', first)).toBe(first);
    expect(panelOwnerForSession('side', second)).toBe(second);
    expect([first, second]).toContain(panelOwnerForSession('side', sessionPanelOwner('other')));
  });

  test('main resource routing preserves a session workspace adopted from its draft', () => {
    const chat = sessionPanelOwner('side');
    const draft = chat.replace('"session","side"', '"draft","draft-side"');
    adoptDraftPanelWorkspace(draft, chat);
    getPanelWorkspaceUI(sessionPanelOwner('host')).getState().openContextPanelTab(directory, { mode: 'chat', dedupeKey: 'session:side' });
    expect(panelOwnerForSession('side', chat)).toBe(draft);
    expect(panelOwnerForSession('side', draft)).toBe(draft);
  });

  test('restored tab membership supplies the side-chat route across hydration', async () => {
    const host = sessionPanelOwner('restored-host');
    getPanelWorkspaceUI(host).getState().openContextPanelTab(directory, { mode: 'chat', dedupeKey: 'session:restored-side' });
    const options = useUIStore.persist.getOptions();
    const snapshot = JSON.parse(JSON.stringify(useUIStore.getState()));
    useUIStore.persist.setOptions({ storage: {
      getItem: () => ({ state: snapshot, version: options.version }),
      setItem: () => undefined,
      removeItem: () => undefined,
    } });
    try {
      useUIStore.setState({ panelWorkspaces: {} });
      await useUIStore.persist.rehydrate();
      expect(panelOwnerForSession('restored-side', sessionPanelOwner('other'))).toBe(host);
      expect(panelOwnerForSession('restored-side', sessionPanelOwner('restored-side'))).toBe(sessionPanelOwner('restored-side'));
    } finally {
      useUIStore.persist.setOptions(options);
    }
  });

  test('confirmed session deletion closes its chat tabs across hosts within the same runtime', () => {
    const host = sessionPanelOwner('host');
    const otherHost = sessionPanelOwner('other-host');
    const foreignHost = sessionPanelOwner('foreign-host', 'another-runtime');
    for (const owner of [host, otherHost, foreignHost]) {
      getPanelWorkspaceUI(owner).getState().openContextPanelTab(directory, { mode: 'chat', dedupeKey: 'session:deleted' });
    }
    getPanelWorkspaceUI(host).getState().openContextFile(directory, `${directory}/kept.ts`);
    deletePanelWorkspace(sessionPanelOwner('deleted'));
    expect(getPanelWorkspaceUI(host).getState().contextPanelByDirectory[directory].tabs.map((tab) => tab.mode)).toEqual(['file']);
    expect(getPanelWorkspaceUI(otherHost).getState().contextPanelByDirectory[directory].tabs).toEqual([]);
    expect(getPanelWorkspaceUI(foreignHost).getState().contextPanelByDirectory[directory].tabs).toHaveLength(1);
  });
});
