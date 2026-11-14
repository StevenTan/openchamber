import { afterEach, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';

const originalPlatform = process.platform;
let callback;
let failLoad = false;
const removed = [];
mock.module('objc-js', () => ({
  NobjcLibrary: class {
    constructor() { if (failLoad) throw new Error('Native module unavailable'); }
    NSEvent = {
      addLocalMonitorForEventsMatchingMask$handler$: (mask, handler) => {
        expect(mask).toBe(4194304); callback = handler; return 'monitor';
      },
      removeMonitor$: (monitor) => removed.push(monitor),
    };
  },
  fromPointer: () => ({ window: () => ({ windowNumber: () => 7 }) }),
  typedBlock: (_signature, handler) => handler,
}));
const { attachMacScrollEvents } = await import('./macos-scroll-events.mjs');
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  callback = undefined; removed.length = 0;
  failLoad = false;
});
const createWindow = () => Object.assign(new EventEmitter(), {
  isDestroyed: () => false, getNativeWindowHandle: () => Buffer.alloc(8),
  webContents: { send: mock(() => {}) },
});
const event = (number = 7) => ({ windowNumber: () => number, phase: () => 8, momentumPhase: () => 0 });

test('sends only this window’s phases to its trusted page and removes the monitor on close', async () => {
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  const window = createWindow(); let local = true;
  expect(await attachMacScrollEvents(window, { canSend: () => local, onError: (error) => { throw error; } })).toBe(true);
  const other = event(8); expect(callback(other)).toBe(other);
  expect(window.webContents.send).not.toHaveBeenCalled();
  const own = event(); expect(callback(own)).toBe(own);
  expect(window.webContents.send).toHaveBeenCalledWith('openchamber:native-scroll', { phase: 8, momentumPhase: 0 });
  local = false; callback(own);
  expect(window.webContents.send).toHaveBeenCalledTimes(1);
  window.emit('closed'); expect(removed).toEqual(['monitor']);
});

test('does not attach after the window closes during the native import', async () => {
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  const window = createWindow();
  const pending = attachMacScrollEvents(window, { canSend: () => true, onError: (error) => { throw error; } });
  window.isDestroyed = () => true;
  expect(await pending).toBe(false); expect(callback).toBeUndefined();
});

test('other platforms do not load the macOS-only capability', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux' });
  await attachMacScrollEvents(createWindow(), { canSend: () => true, onError: (error) => { throw error; } });
  expect(callback).toBeUndefined();
});

test('reports unavailable when the native module fails to initialize', async () => {
  Object.defineProperty(process, 'platform', { value: 'darwin' }); failLoad = true;
  const errors = [];
  expect(await attachMacScrollEvents(createWindow(), { canSend: () => true, onError: (error) => errors.push(error) })).toBe(false);
  expect(errors).toHaveLength(1); expect(callback).toBeUndefined();
});
