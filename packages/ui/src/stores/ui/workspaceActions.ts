import { shownMobileWorkspaceTabs, storedMobileWorkspaceTabOrder } from '@/lib/mobileWorkspaceTabs';
import { carrySurfaceToZone, zoneOfMode } from '@/lib/workspace/zones';
import type { ContextZonePlacement } from '@/lib/workspace/zones';
import { sanitizeWorkStatusSectionOrder } from '@/components/chat/work-status/sections';
import { clampContextEditorTreeWidth } from './preferences';
import type { ContextPanelDirectoryState, UIStoreSlice } from './types';
import { clampContextZoneSize } from './contextTabs';

export const createWorkspaceActions: UIStoreSlice<
  | 'toggleSidebar'
  | 'setSidebarOpen'
  | 'setSidebarFoldedForExpandedZone'
  | 'setSidebarWidth'
  | 'setContextRailOrder'
  | 'setContextEditorTreeWidth'
  | 'setContextZoneSize'
  | 'setContextZoneExpandedChatSize'
  | 'moveContextSurfaceToZone'
  | 'setWorkStatusSectionExpanded'
  | 'setMessageQueueExpanded'
  | 'setWorkStatusScrollTop'
  | 'setWorkStatusPanelEnabled'
  | 'setWorkStatusPanelVisible'
  | 'setWorkStatusPanelFits'
  | 'setWorkStatusOverlayOpen'
  | 'setWorkStatusSectionVisible'
  | 'setWorkStatusHiddenSections'
  | 'setMobileWorkStatusSectionVisible'
  | 'setMobileWorkStatusHiddenSections'
  | 'setWorkStatusSectionOrder'
  | 'setContextRailSurfaceVisible'
  | 'setContextRailHiddenSurfaces'
  | 'setMobileWorkspaceTabOrder'
  | 'setMobileWorkspaceTabVisible'
> = (set) => ({
  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },

  setSidebarOpen: (open) => {
    set((state) => state.isSidebarOpen === open ? state : { isSidebarOpen: open });
  },

  setSidebarFoldedForExpandedZone: (folded) => {
    set((state) => state.sidebarFoldedForExpandedZone === folded ? state : { sidebarFoldedForExpandedZone: folded });
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: width });
  },

  setContextRailOrder: (order) => {
    const sanitized = order.filter((id, index) => id.trim() !== '' && order.indexOf(id) === index);
    set({ contextRailOrder: sanitized });
  },

  setContextEditorTreeWidth: (width) => {
    if (!Number.isFinite(width)) {
      return;
    }
    set({ contextEditorTreeWidth: clampContextEditorTreeWidth(width) });
  },

  setContextZoneSize: (zone, size) => {
    set((state) => ({ contextZoneSizes: { ...state.contextZoneSizes, [zone]: clampContextZoneSize(zone, size) } }));
  },

  setContextZoneExpandedChatSize: (zone, size) => {
    if (!Number.isFinite(size)) return;
    set((state) => ({ contextZoneExpandedChatSizes: { ...state.contextZoneExpandedChatSizes, [zone]: Math.max(0, Math.round(size)) } }));
  },

  moveContextSurfaceToZone: (mode, zone) => {
    set((state) => {
      const from = zoneOfMode(state.contextSurfaceZones, mode);
      if (from === zone) {
        return state;
      }

      const placement: ContextZonePlacement = { ...state.contextSurfaceZones };
      if (zone === 'right') {
        delete placement[mode];
      } else {
        placement[mode] = zone;
      }

      const byDirectory: Record<string, ContextPanelDirectoryState> = {};
      for (const [directory, panel] of Object.entries(state.contextPanelByDirectory)) {
        byDirectory[directory] = carrySurfaceToZone(panel, mode, from, zone, placement);
      }

      const panelWorkspaces = Object.fromEntries(Object.entries(state.panelWorkspaces).map(([owner, workspace]) => [owner, {
        ...workspace,
        contextPanelByDirectory: Object.fromEntries(Object.entries(workspace.contextPanelByDirectory).map(([directory, panel]) =>
          [directory, carrySurfaceToZone(panel, mode, from, zone, placement)])),
      }]));
      return { contextSurfaceZones: placement, contextPanelByDirectory: byDirectory, panelWorkspaces };
    });
  },

  setWorkStatusSectionExpanded: (sectionId, expanded) => {
    set((state) => (
      state.workStatusExpandedSections[sectionId] === expanded
        ? state
        : {
          workStatusExpandedSections: {
            ...state.workStatusExpandedSections,
            [sectionId]: expanded,
          },
        }
    ));
  },

  setMessageQueueExpanded: (expanded) => {
    set((state) => (state.messageQueueExpanded === expanded ? state : { messageQueueExpanded: expanded }));
  },

  setWorkStatusScrollTop: (scrollTop) => {
    set({ workStatusScrollTop: Math.max(0, scrollTop) });
  },

  setWorkStatusPanelEnabled: (enabled) => {
    set({ workStatusPanelEnabled: enabled });
  },

  setWorkStatusPanelVisible: (visible) => {
    set((state) => (state.workStatusPanelVisible === visible ? state : { workStatusPanelVisible: visible }));
  },

  setWorkStatusPanelFits: (fits) => {
    set((state) => {
      if (state.workStatusPanelFits === fits) return state;
      return fits
        ? { workStatusPanelFits: true, workStatusOverlayOpen: false }
        : { workStatusPanelFits: false };
    });
  },

  setWorkStatusOverlayOpen: (open) => {
    set((state) => (state.workStatusOverlayOpen === open ? state : { workStatusOverlayOpen: open }));
  },

  setWorkStatusSectionVisible: (sectionId, visible) => {
    set((state) => {
      const hidden = state.workStatusHiddenSections;
      const isHidden = hidden.includes(sectionId);
      if (visible === !isHidden) return state;
      return {
        workStatusHiddenSectionsExplicit: true,
        workStatusHiddenSections: visible
          ? hidden.filter((entry) => entry !== sectionId)
          : [...hidden, sectionId],
      };
    });
  },

  setWorkStatusHiddenSections: (sectionIds) => {
    set({ workStatusHiddenSections: [...new Set(sectionIds)], workStatusHiddenSectionsExplicit: true });
  },

  setMobileWorkStatusSectionVisible: (sectionId, visible) => {
    set((state) => {
      const hidden = state.mobileWorkStatusHiddenSections;
      if (visible === !hidden.includes(sectionId)) return state;
      return {
        mobileWorkStatusHiddenSections: visible
          ? hidden.filter((entry) => entry !== sectionId)
          : [...hidden, sectionId],
      };
    });
  },

  setMobileWorkStatusHiddenSections: (sectionIds) => {
    set({ mobileWorkStatusHiddenSections: [...new Set(sectionIds)] });
  },

  setWorkStatusSectionOrder: (sectionIds) => {
    set({ workStatusSectionOrder: sanitizeWorkStatusSectionOrder(sectionIds), workStatusSectionOrderExplicit: true });
  },

  setContextRailSurfaceVisible: (surfaceId, visible) => {
    set((state) => {
      const hidden = state.contextRailHiddenSurfaces;
      const isHidden = hidden.includes(surfaceId);
      if (visible === !isHidden) return state;
      return {
        contextRailHiddenSurfaces: visible
          ? hidden.filter((entry) => entry !== surfaceId)
          : [...hidden, surfaceId],
      };
    });
  },

  setContextRailHiddenSurfaces: (surfaceIds) => {
    set({ contextRailHiddenSurfaces: [...new Set(surfaceIds)] });
  },

  setMobileWorkspaceTabOrder: (order) => {
    set((state) => ({ mobileWorkspaceTabOrder: storedMobileWorkspaceTabOrder(order, state.mobileWorkspaceTabOrder) }));
  },

  setMobileWorkspaceTabVisible: (tab, visible, extensions) => {
    set((state) => {
      const hidden = state.mobileWorkspaceHiddenTabs;
      if (visible) {
        return hidden.includes(tab) ? { mobileWorkspaceHiddenTabs: hidden.filter((entry) => entry !== tab) } : state;
      }
      if (hidden.includes(tab)) return state;
      const shown = shownMobileWorkspaceTabs(state.mobileWorkspaceTabOrder, hidden, extensions);
      if (shown.length <= 1) return state;
      return { mobileWorkspaceHiddenTabs: [...hidden, tab] };
    });
  },

});
