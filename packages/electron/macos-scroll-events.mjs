/** AppKit keeps contact and momentum phases even when a canvas cancels wheel. */
export async function attachMacScrollEvents(window, { canSend, onError }) {
  if (process.platform !== 'darwin') return false;
  try {
    const { NobjcLibrary, fromPointer, typedBlock } = await import('objc-js');
    if (window.isDestroyed()) return false;
    const { webContents } = window;
    const { NSEvent } = new NobjcLibrary('/System/Library/Frameworks/AppKit.framework/AppKit');
    const view = fromPointer(window.getNativeWindowHandle());
    const windowNumber = view.window().windowNumber();
    const handler = typedBlock({ returns: '@', args: ['@'] }, (event) => {
      if (event.windowNumber() !== windowNumber || !canSend(webContents)) return event;
      webContents.send('openchamber:native-scroll', {
        phase: event.phase(),
        momentumPhase: event.momentumPhase(),
      });
      return event;
    });
    // NSEventMaskScrollWheel. A local monitor sees only this app's events and
    // returns each event unchanged; it needs no global input-monitoring grant.
    const monitor = NSEvent.addLocalMonitorForEventsMatchingMask$handler$(4194304, handler);
    window.once('closed', () => NSEvent.removeMonitor$(monitor));
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
