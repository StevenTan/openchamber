import React from 'react';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, CUSTOM_FONT_ID, DEFAULT_MONO_FONT, DEFAULT_UI_FONT, UI_FONT_OPTION_MAP, UI_FONT_WEIGHT_VALUES, customFontStack } from '@/lib/fontOptions';
import { loadMonoFont, loadUiFont } from '@/lib/fontLoader';
import { useUIStore } from '@/stores/useUIStore';
import '@/styles/bundled-fonts.css';

export function useAppFontEffects() {
  const { uiFont, monoFont, customUiFont, customMonoFont, chatFont, customChatFont } = useFontPreferences();
  const uiFontWeight = useUIStore((state) => state.uiFontWeight);

  // A layout effect, like ThemeProvider's size write: a page drawn in the
  // chat reads these variables in a passive effect and must see the new ones.
  React.useLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const defaultUiStack = UI_FONT_OPTION_MAP[DEFAULT_UI_FONT].stack;
    const defaultMonoStack = CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT].stack;
    const uiStack = uiFont === CUSTOM_FONT_ID
      ? customFontStack(customUiFont, defaultUiStack)
      : UI_FONT_OPTION_MAP[uiFont]?.stack ?? defaultUiStack;
    const monoStack = monoFont === CUSTOM_FONT_ID
      ? customFontStack(customMonoFont, defaultMonoStack)
      : CODE_FONT_OPTION_MAP[monoFont]?.stack ?? defaultMonoStack;
    const chatStack = chatFont === 'interface' ? uiStack : chatFont === CUSTOM_FONT_ID
      ? customFontStack(customChatFont, uiStack)
      : UI_FONT_OPTION_MAP[chatFont].stack;
    void loadUiFont(uiFont);
    void loadMonoFont(monoFont);
    if (chatFont !== 'interface') void loadUiFont(chatFont);

    root.style.setProperty('--font-sans', uiStack);
    root.style.setProperty('--font-heading', uiStack);
    root.style.setProperty('--font-family-sans', uiStack);
    root.style.setProperty('--font-mono', monoStack);
    root.style.setProperty('--font-chat', chatStack);
    root.style.setProperty('--font-family-mono', monoStack);
    root.style.setProperty('--ui-regular-font-weight', String(UI_FONT_WEIGHT_VALUES[uiFontWeight] ?? 400));

    if (document.body) {
      document.body.style.fontFamily = uiStack;
    }
  }, [uiFont, monoFont, customUiFont, customMonoFont, uiFontWeight, chatFont, customChatFont]);
}
