import { afterEach, beforeEach, expect, test } from 'bun:test';
import { useUIStore } from './useUIStore';
import { applySettingsToStores, isWritableSettingsKey, readAutoSaveSnapshot } from '@/lib/settings/registry';
import { Window } from 'happy-dom';

const original = useUIStore.getState();
const options = useUIStore.persist.getOptions();
let dom: Window;
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => {
    dom = new Window();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: dom });
});
afterEach(async () => {
    useUIStore.persist.setOptions(options);
    useUIStore.setState(original, true);
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
    await dom.happyDOM.close();
});

test('stored percentages migrate once into independent pixel sizes', async () => {
    useUIStore.persist.setOptions({
        storage: {
            getItem: () => ({
                version: 29,
                state: { fontSize: 115, chatFontSize: 95, terminalFontSize: 15, editorFontSize: 15 },
            }),
            setItem: () => undefined,
            removeItem: () => undefined,
        },
    });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().interfaceFontSizePx).toBeCloseTo(15.525);
    expect(useUIStore.getState().chatFontSizePx).toBeCloseTo(15.295);
    expect(useUIStore.getState().appZoom).toBe(100);
    expect(useUIStore.getState().editorFontSize).toBe(15);
    const partial = options.partialize?.(useUIStore.getState());
    expect(partial).not.toHaveProperty('fontSize');
    expect(partial).not.toHaveProperty('chatFontSize');
});

test('pixel preferences take precedence over legacy server percentages', async () => {
    const beforeZoom = useUIStore.getState().appZoom;
    applySettingsToStores({
        fontSize: 150,
        chatFontSize: 130,
        interfaceFontSizePx: 16,
        chatFontSizePx: 18,
    });
    expect(useUIStore.getState().interfaceFontSizePx).toBe(16);
    expect(useUIStore.getState().chatFontSizePx).toBe(18);
    expect(useUIStore.getState().appZoom).toBe(beforeZoom);
    expect(isWritableSettingsKey('interfaceFontSizePx')).toBe(true);
    const saved = options.partialize?.({ ...useUIStore.getState(), appZoom: 125 });
    expect(saved).toMatchObject({ appZoom: 125 });
    expect(readAutoSaveSnapshot()).not.toHaveProperty('appZoom');
});

test('a partial legacy snapshot preserves the omitted font preference', () => {
    useUIStore.setState({ interfaceFontSizePx: 16, chatFontSizePx: 18 });
    applySettingsToStores({ chatFontSize: 150 });
    expect(useUIStore.getState().interfaceFontSizePx).toBe(16);
    expect(useUIStore.getState().chatFontSizePx).toBeCloseTo(((14 * 16) / 13.5) * 1.5);
    useUIStore.setState({ chatFontSizePx: 18 });
    applySettingsToStores({ fontSize: 110 });
    expect(useUIStore.getState().interfaceFontSizePx).toBeCloseTo(14.85);
    expect(useUIStore.getState().chatFontSizePx).toBeCloseTo((18 * 14.85) / 16);
});

test('VS Code percentages retain the webview font metrics', () => {
    Object.assign(dom, { __VSCODE_CONFIG__: {} });
    applySettingsToStores({ fontSize: 115, chatFontSize: 95 });
    expect(useUIStore.getState().interfaceFontSizePx).toBeCloseTo(12.5008 * 1.15);
    expect(useUIStore.getState().chatFontSizePx).toBeCloseTo(13.5008 * 1.15 * 0.95);
});
