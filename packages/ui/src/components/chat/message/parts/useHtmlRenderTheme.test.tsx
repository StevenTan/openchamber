import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import type { HtmlRenderTheme } from './htmlRender';

// React decides at import time whether a DOM exists, so the window comes first.
const win = new Window({ url: 'http://localhost' });
const browserGlobals = {
    window: win, document: win.document, navigator: win.navigator,
    HTMLElement: win.HTMLElement, localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win), IS_REACT_ACT_ENVIRONMENT: true,
};
const previousGlobals = new Map(Object.keys(browserGlobals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries(browserGlobals)) Object.defineProperty(globalThis, key, { configurable: true, value });

const { createRoot } = await import('react-dom/client');
const { useAppFontEffects } = await import('@/apps/useAppFontEffects');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { useUIStore } = await import('@/stores/useUIStore');
const { useHtmlRenderTheme } = await import('./useHtmlRenderTheme');
const { ThemeProvider } = await import('@/components/providers/ThemeProvider');

afterAll(async () => {
    for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
    await win.happyDOM.close();
});

function AppRoot({ children }: { children: React.ReactNode }) {
    useAppFontEffects();
    return <ThemeProvider>{children}</ThemeProvider>;
}

let theme: HtmlRenderTheme | null = null;
function Page() {
    theme = useHtmlRenderTheme();
    return null;
}
const pageVariable = (name: string) => theme?.variables[name];

describe('a drawn page follows the interface settings', () => {
    let root: Root;

    beforeEach(async () => {
        useUIStore.setState({ interfaceFontSizePx: 15.5, chatFontSizePx: 14, chatFont: 'interface', uiFont: 'custom', customUiFont: 'Inter' });
        root = createRoot(document.createElement('div'));
        await act(async () => root.render(<ThemeSystemProvider><AppRoot><Page /></AppRoot></ThemeSystemProvider>));
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        document.documentElement.classList.remove('mobile-pointer');
    });

    test('interface text size leaves the page rem and chat body size independent', async () => {
        expect(pageVariable('--oc-rem')).toBe('16px');
        await act(async () => useUIStore.setState({ interfaceFontSizePx: 19 }));
        expect(pageVariable('--oc-rem')).toBe('16px');
        expect(pageVariable('--oc-text')).toBe('14px');
    });

    test('takes the chat font size in its text and leaves the app rem alone', async () => {
        expect(pageVariable('--oc-text')).toBe(`${0.875 * 16}px`);
        await act(async () => useUIStore.setState({ chatFontSizePx: 18 }));
        expect(pageVariable('--oc-text')).toBe('18px');
        expect(pageVariable('--oc-rem')).toBe('16px');
        await act(async () => useUIStore.setState({ chatFontSizePx: 14 }));
        expect(pageVariable('--oc-text')).toBe(`${0.875 * 16}px`);
        expect(pageVariable('--oc-rem')).toBe('16px');
    });

    test('keeps the phone text size, which the chat setting does not reach', async () => {
        document.documentElement.classList.add('mobile-pointer');
        const style = document.createElement('style');
        style.textContent = ':root.mobile-pointer{--text-markdown:1rem!important}';
        document.head.append(style);
        await act(async () => useUIStore.setState({ chatFontSizePx: 18 }));
        expect(pageVariable('--oc-text')).toBe('16px');
        style.remove();
    });

    test('takes the new interface font', async () => {
        expect(pageVariable('--font-sans')).toContain('"Inter"');
        await act(async () => useUIStore.setState({ customUiFont: 'Georgia' }));
        expect(pageVariable('--font-sans')).toContain('"Georgia"');
    });

    test('uses an independent chat font for drawn pages', async () => {
        await act(async () => useUIStore.setState({ chatFont: 'custom', customChatFont: 'Georgia' }));
        expect(pageVariable('--font-sans')).toContain('"Georgia"');
        await act(async () => useUIStore.setState({ customUiFont: 'Verdana' }));
        expect(pageVariable('--font-sans')).toContain('"Georgia"');
    });
});
