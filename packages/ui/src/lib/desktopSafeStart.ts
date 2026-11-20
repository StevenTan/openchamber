import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { forgetPanelWorkspaceLayouts } from '@/stores/useUIStore';

declare global {
  interface Window {
    __OPENCHAMBER_SAFE_START__?: boolean;
  }
}

export const isDesktopSafeStart = (): boolean => globalThis.window?.__OPENCHAMBER_SAFE_START__ === true;

export const forgetLayoutForSafeStart = (): void => {
  useFilesViewTabsStore.setState({ byRoot: {}, runtimeSnapshots: {} });

  forgetPanelWorkspaceLayouts();
};
