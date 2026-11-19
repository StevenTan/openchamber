import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAgentCursor } from './browser-agent-cursor.mjs';

const fixture = () => {
  const owner = Object.assign(new EventEmitter(), { isDestroyed: () => false, messages: [], send(_channel, message) { this.messages.push(message); } });
  const target = Object.assign(new EventEmitter(), { id: 7, hostWebContents: owner });
  return { cursor: createBrowserAgentCursor(), owner, target };
};

test('waits for arrival from the window that owns the page', async () => {
  const { cursor, owner, target } = fixture();
  let completed = false;
  const move = cursor.move(target, { x: 12, y: 34 }, 'request-a').then(() => { completed = true; });
  const { moveId, ...point } = owner.messages[0].detail;
  assert.deepEqual(point, { webContentsId: 7, requestId: 'request-a', x: 12, y: 34, animate: true });
  cursor.arrive(new EventEmitter(), moveId);
  await Promise.resolve();
  assert.equal(completed, false);
  cursor.arrive(owner, moveId);
  await move;
  assert.equal(completed, true);
  assert.equal(owner.listenerCount('destroyed'), 0);
});

test('dragging updates the cursor without waiting for animation', async () => {
  const { cursor, owner, target } = fixture();
  await cursor.move(target, { x: 12, y: 34, buttons: 1 });
  assert.equal(owner.messages.length, 1);
  assert.equal(owner.listenerCount('destroyed'), 0);
});

test('hidden views publish position without an arrival wait', async () => {
  const { cursor, owner, target } = fixture();
  await cursor.move(target, { x: 12, y: 34 }, 'hidden', false);
  assert.equal(owner.messages[0].detail.animate, false);
  assert.equal(owner.listenerCount('destroyed'), 0);
});

test('disconnect releases only that page pending arrivals', async () => {
  const { cursor, owner, target } = fixture();
  const other = Object.assign(new EventEmitter(), { id: 8, hostWebContents: owner });
  let otherCompleted = false;
  const first = cursor.move(target, { x: 1, y: 2 });
  const second = cursor.move(other, { x: 3, y: 4 }).then(() => { otherCompleted = true; });
  cursor.cancel(target);
  await first;
  assert.equal(otherCompleted, false);
  cursor.arrive(owner, owner.messages[1].detail.moveId);
  await second;
});

test('a renderer that cannot acknowledge has a bounded arrival wait', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { cursor, owner, target } = fixture();
  const move = cursor.move(target, { x: 1, y: 2 });
  context.mock.timers.tick(1500);
  await move;
  assert.equal(owner.listenerCount('destroyed'), 0);
});
