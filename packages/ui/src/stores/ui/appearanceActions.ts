import { isVSCodeRuntime } from '@/lib/desktop';
import { getInterfaceTypographyStyle, VSCODE_TYPOGRAPHY, SEMANTIC_TYPOGRAPHY } from '@/lib/typography';

import type { UIStoreSlice } from './types';

export const createAppearanceActions: UIStoreSlice<
  | 'setTheme'
  | 'setTerminalFontSize'
  | 'setEditorFontSize'
  | 'setUiFont'
  | 'setMonoFont'
  | 'setCustomUiFont'
  | 'setCustomMonoFont'
  | 'setUiFontWeight'
  | 'setPadding'
  | 'setCornerRadius'
  | 'applyTypography'
  | 'applyPadding'
  | 'applyTheme'
  | 'setInterfaceFontSizePx'
  | 'setChatFontSizePx'
  | 'setAppZoom'
  | 'setChatFont'
  | 'setCustomChatFont'
> = (set, get) => ({
  setTheme: (theme) => {
    set({ theme });
    get().applyTheme();
  },

  setTerminalFontSize: (size) => {
    const rounded = Math.round(size);
    const clamped = Math.max(9, Math.min(52, rounded));
    set({ terminalFontSize: clamped });
  },

  setEditorFontSize: (size) => {
    const rounded = Math.round(size);
    const clamped = Math.max(9, Math.min(32, rounded));
    set({ editorFontSize: clamped });
  },

  setUiFont: (font) => {
    set({ uiFont: font });
  },

  setMonoFont: (font) => {
    set({ monoFont: font });
  },

  setCustomUiFont: (family) => {
    set({ customUiFont: family.slice(0, 100) });
  },

  setCustomMonoFont: (family) => {
    set({ customMonoFont: family.slice(0, 100) });
  },

  setUiFontWeight: (weight) => {
    set({ uiFontWeight: weight });
  },

  setPadding: (size) => {
    const clampedSize = Math.max(50, Math.min(200, size));
    set({ padding: clampedSize });
    get().applyPadding();
  },

  setCornerRadius: (radius) => {
    set({ cornerRadius: radius });
  },

  applyTypography: () => {
    const { interfaceFontSizePx, chatFontSizePx, editorFontSize } = get();
    const root = document.documentElement;
    root.style.removeProperty('font-size');
    for (const [key, value] of Object.entries(getInterfaceTypographyStyle(interfaceFontSizePx, isVSCodeRuntime() ? VSCODE_TYPOGRAPHY : SEMANTIC_TYPOGRAPHY))) {
      root.style.setProperty(key, value);
    }
    root.style.setProperty('--text-markdown', `${chatFontSizePx}px`);
    root.style.setProperty('--text-code', `${editorFontSize}px`);
    document.body.style.fontSize = `${interfaceFontSizePx}px`;
  },

  applyPadding: () => {
    const { padding } = get();
    const root = document.documentElement;

    const scale = padding / 100;

    if (scale === 1) {
      root.style.removeProperty('--padding-scale');
      root.style.removeProperty('--line-height-tight');
      root.style.removeProperty('--line-height-normal');
      root.style.removeProperty('--line-height-relaxed');
      root.style.removeProperty('--line-height-loose');
      return;
    }

    const adjustedScale = Math.sqrt(scale);

    root.style.setProperty('--padding-scale', adjustedScale.toString());

    const lineHeightScale = 1 + (scale - 1) * 0.15;

    root.style.setProperty('--line-height-tight', (1.25 * lineHeightScale).toFixed(3));
    root.style.setProperty('--line-height-normal', (1.5 * lineHeightScale).toFixed(3));
    root.style.setProperty('--line-height-relaxed', (1.625 * lineHeightScale).toFixed(3));
    root.style.setProperty('--line-height-loose', (2 * lineHeightScale).toFixed(3));
  },

  applyTheme: () => {
    const { theme } = get();
    const root = document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  },

  setInterfaceFontSizePx: (size) => {
    set({ interfaceFontSizePx: Math.max(6, Math.min(32, size)) });
    get().applyTypography();
  },

  setChatFontSizePx: (size) => {
    set({ chatFontSizePx: Math.max(3, Math.min(64, size)) });
    get().applyTypography();
  },

  setAppZoom: (percent) => set({ appZoom: Math.max(50, Math.min(200, Math.round(percent))) }),

  setChatFont: (chatFont) => set({ chatFont }),

  setCustomChatFont: (family) => set({ customChatFont: family.slice(0, 100) }),

});
