import { useEffect } from 'react';
import { isVSCodeRuntime } from '@/lib/desktop';
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeKey, isTransientRuntimeKey, subscribeRuntimeEndpointChanged, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { useUIStore } from '@/stores/useUIStore';

export const CUSTOM_CSS_STYLE_ID = 'openchamber-custom-css';

/** Owns one stylesheet for the connected instance, after the theme variables. */
export const useCustomCss = (): void => {
  const enabled = useUIStore((state) => state.customCssEnabled);
  useEffect(() => {
    if (isVSCodeRuntime() || !enabled || new URLSearchParams(window.location.search).get('custom-css') === 'off') return;
    let request: AbortController | undefined;
    let style: HTMLStyleElement | undefined;
    const invalidate = () => {
      request?.abort();
      style?.remove();
      style = undefined;
    };
    const reload = async () => {
      if (isTransientRuntimeKey(getRuntimeKey())) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await runtimeFetch('/api/config/custom-css', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object' || !('css' in payload) || typeof payload.css !== 'string') throw new Error('Invalid stylesheet response');
        if (controller.signal.aborted) return;
        if (!payload.css) {
          style?.remove();
          style = undefined;
          return;
        }
        if (!style) {
          style = document.createElement('style');
          style.id = CUSTOM_CSS_STYLE_ID;
          document.head.append(style);
        }
        style.textContent = payload.css;
      } catch (error) {
        if (controller.signal.aborted) return;
        // A failed read keeps this instance's last successful stylesheet.
        console.warn('Could not load custom.css:', error);
      }
    };
    const unsubscribeWillChange = subscribeRuntimeEndpointWillChange(invalidate);
    const unsubscribeChanged = subscribeRuntimeEndpointChanged(() => { void reload(); });
    const unsubscribeEvents = subscribeOpenchamberEvents((event) => {
      if (event.type === 'custom-css-changed' || event.type === 'event-stream-ready') void reload();
    });
    void reload();
    return () => {
      invalidate();
      unsubscribeWillChange();
      unsubscribeChanged();
      unsubscribeEvents();
    };
  }, [enabled]);
};
