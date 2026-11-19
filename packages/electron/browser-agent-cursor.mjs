const ARRIVAL_TIMEOUT_MS = 1_500;

/** Synchronizes the panel's visible cursor with page input. */
export function createBrowserAgentCursor() {
  let sequence = 0;
  const pending = new Map();
  const finish = (moveId) => {
    const move = pending.get(moveId);
    if (!move) return;
    pending.delete(moveId);
    clearTimeout(move.timer);
    move.target.removeListener('destroyed', move.resolve);
    move.owner.removeListener('destroyed', move.resolve);
    move.done();
  };
  return {
    async move(target, { x, y, buttons = 0 }, requestId, animate = true) {
      const owner = target.hostWebContents;
      if (!owner || owner.isDestroyed()) return;
      const moveId = ++sequence;
      const arrived = buttons === 0 && animate ? new Promise((done) => {
        const resolve = () => finish(moveId);
        const timer = setTimeout(() => {
          console.warn('[browser-cursor] Arrival acknowledgement timed out', { requestId, webContentsId: target.id });
          resolve();
        }, ARRIVAL_TIMEOUT_MS);
        pending.set(moveId, { owner, target, requestId, timer, resolve, done });
        owner.once('destroyed', resolve);
        target.once('destroyed', resolve);
      }) : undefined;
      owner.send('openchamber:emit', {
        event: 'openchamber:browser-agent-cursor',
        detail: { webContentsId: target.id, moveId, requestId, x, y, animate },
      });
      await arrived;
    },
    arrive(owner, moveId) {
      if (pending.get(moveId)?.owner === owner) finish(moveId);
    },
    cancel(target) {
      for (const [moveId, move] of pending) if (move.target === target) finish(moveId);
    },
    releaseRequest(requestId) {
      for (const [moveId, move] of pending) if (move.requestId === requestId) finish(moveId);
    },
  };
}
