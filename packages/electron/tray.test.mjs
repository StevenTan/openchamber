import { expect, mock, test, jest } from 'bun:test';
import { EventEmitter } from 'node:events';
import { TRAY_BREATH_INTERVAL_MS } from './tray-animation.mjs';

let attachedMenu;
let nativeTray;
class Tray extends EventEmitter {
  constructor(image) { super(); this.images = [image.path]; nativeTray = this; }
  setIgnoreDoubleClickEvents() {}
  setImage(image) { this.images.push(image.path); }
  setTitle() {}
  setToolTip() {}
  setContextMenu(menu) { attachedMenu = menu; }
  destroy() {}
}
mock.module('electron', () => ({
  Tray,
  Menu: { buildFromTemplate: () => new EventEmitter() },
  nativeImage: { createFromPath: (path) => ({ isEmpty: () => true, path }) },
}));
const { createTrayController } = await import('./tray.mjs');

test('the native menu lifecycle reports each opening through the renderer action route', () => {
  const actions = [];
  const tray = createTrayController({ idleIconPath: '', unseenIconPath: '', breathIconPaths: [], onAction: action => actions.push(action) });
  try {
    tray.update({ sessions: [] });
    expect(actions).toEqual([]);
    attachedMenu.emit('menu-will-show');
    attachedMenu.emit('menu-will-close');
    attachedMenu.emit('menu-will-show');
    expect(actions).toEqual([{ type: 'menu-opened' }, { type: 'menu-opened' }]);
  } finally { tray.destroy(); }
});

test('animation can stop and resume during work while preserving unread indicators', () => {
  jest.useFakeTimers();
  const tray = createTrayController({ idleIconPath: 'idle', unseenIconPath: 'unseen', breathIconPaths: ['frame0', 'frame1', 'frame2'], onAction: () => {} });
  try {
    tray.update({ sessions: [{ status: 'busy', unseen: 1 }] });
    jest.advanceTimersByTime(TRAY_BREATH_INTERVAL_MS * 3);
    expect(nativeTray.images.slice(-3)).toEqual(['frame0', 'frame1', 'frame2']);
    tray.setAnimationEnabled(false);
    expect(nativeTray.images.at(-1)).toBe('unseen');
    const stoppedCount = nativeTray.images.length;
    jest.advanceTimersByTime(1000);
    expect(nativeTray.images.length).toBe(stoppedCount);
    tray.setAnimationEnabled(true);
    jest.advanceTimersByTime(TRAY_BREATH_INTERVAL_MS);
    expect(nativeTray.images.at(-1)).toBe('frame0');
    tray.update({ sessions: [] });
    expect(nativeTray.images.at(-1)).toBe('idle');
    const idleCount = nativeTray.images.length;
    jest.advanceTimersByTime(1000);
    expect(nativeTray.images.length).toBe(idleCount);
  } finally { tray.destroy(); jest.useRealTimers(); }
});

test('animation disabled at startup keeps a busy icon static', () => {
  jest.useFakeTimers();
  const tray = createTrayController({ idleIconPath: 'idle', unseenIconPath: 'unseen', breathIconPaths: ['frame0', 'frame1'], animationEnabled: false, onAction: () => {} });
  try {
    tray.update({ sessions: [{ status: 'busy' }] });
    expect(nativeTray.images.at(-1)).toBe('idle');
    const count = nativeTray.images.length;
    jest.advanceTimersByTime(1000);
    expect(nativeTray.images.length).toBe(count);
  } finally { tray.destroy(); jest.useRealTimers(); }
});
