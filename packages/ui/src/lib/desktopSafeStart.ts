import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { forgetPanelWorkspaceLayouts } from '@/stores/useUIStore';

declare global {
  interface Window {
    /** Set by the desktop preload on the load after the window crashed several times in a row. */
    __OPENCHAMBER_SAFE_START__?: boolean;
  }
}

/** True when the desktop app reloaded this window because it kept crashing. */
export const isDesktopSafeStart = (): boolean => globalThis.window?.__OPENCHAMBER_SAFE_START__ === true;

/**
 * Forget the saved layout a crashing window restores on every load: expanded
 * folders, open files and open panels. Runs before the first render, and the
 * stores persist the result, so the next launch starts from it too.
 */
export const forgetLayoutForSafeStart = (): void => {
  useFilesViewTabsStore.setState({ byRoot: {}, runtimeSnapshots: {} });

  forgetPanelWorkspaceLayouts();
};
