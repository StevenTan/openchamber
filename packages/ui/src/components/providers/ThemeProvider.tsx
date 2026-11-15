import React from 'react';
import type { RuntimeAPIs } from '@/lib/api/types';
import { DEFAULT_APP_ZOOM } from '@/lib/typography';
import { useUIStore } from '@/stores/useUIStore';

interface ThemeProviderProps {
  children: React.ReactNode;
  zoom?: RuntimeAPIs['zoom'];
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, zoom }) => {
  const interfaceSize = useUIStore((state) => state.interfaceFontSizePx);
  const chatSize = useUIStore((state) => state.chatFontSizePx);
  const codeSize = useUIStore((state) => state.editorFontSize);
  const appZoom = useUIStore((state) => state.appZoom);
  const applyTypography = useUIStore((state) => state.applyTypography);
  const padding = useUIStore((state) => state.padding);
  const applyPadding = useUIStore((state) => state.applyPadding);

  React.useLayoutEffect(() => {
    applyTypography();
    applyPadding();
  }, [interfaceSize, chatSize, codeSize, applyTypography, padding, applyPadding]);

  React.useEffect(() => {
    if (zoom) void zoom.set(appZoom).catch((error) => console.error('Window zoom failed', error));
  }, [zoom, appZoom]);

  React.useEffect(() => {
    if (!zoom) return;
    const handleZoom = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const action = event.detail;
      if (action !== 'zoom-in' && action !== 'zoom-out' && action !== 'zoom-reset') return;
      const active = document.activeElement;
      if (active?.tagName === 'WEBVIEW' || active?.closest('webview')) return;
      const state = useUIStore.getState();
      if (action === 'zoom-reset') {
        state.setAppZoom(DEFAULT_APP_ZOOM);
      } else {
        state.setAppZoom(state.appZoom + (action === 'zoom-in' ? 10 : -10));
      }
    };
    window.addEventListener('openchamber:zoom', handleZoom);
    return () => window.removeEventListener('openchamber:zoom', handleZoom);
  }, [zoom]);

  return <>{children}</>;
};
