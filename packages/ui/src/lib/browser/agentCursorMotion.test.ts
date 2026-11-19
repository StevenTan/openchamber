import { expect, test } from 'bun:test';
import { AgentCursorMotion } from './agentCursorMotion';

const advanceToArrival = (motion: AgentCursorMotion): number => {
  for (let frame = 0; frame < 240; frame += 1) if (motion.advance(1 / 60)) return frame;
  throw new Error('Cursor did not arrive');
};

test('short moves land exactly at the target with a finite animation', () => {
  const motion = new AgentCursorMotion({ x: 100, y: 100 });
  motion.move({ x: 200, y: 150 }, { width: 800, height: 600 });
  expect(advanceToArrival(motion)).toBeLessThan(90);
  expect(motion.point).toEqual({ x: 200, y: 150 });
  expect(motion.stretch).toBe(1);
});

test('long moves curve within the page and arrive at the target', () => {
  const motion = new AgentCursorMotion({ x: 100, y: 500 });
  motion.move({ x: 700, y: 100 }, { width: 800, height: 600 });
  let curved = false;
  for (let frame = 0; frame < 240; frame += 1) {
    const arrived = motion.advance(1 / 60);
    const expectedY = 500 - (motion.point.x - 100) * 2 / 3;
    curved ||= Math.abs(expectedY - motion.point.y) > 5;
    expect(Number.isFinite(motion.rotation)).toBe(true);
    if (arrived) break;
  }
  expect(curved).toBe(true);
  expect(motion.point).toEqual({ x: 700, y: 100 });
});

test('a drag retargets from the current point', () => {
  const motion = new AgentCursorMotion({ x: 100, y: 100 });
  motion.move({ x: 700, y: 500 }, { width: 800, height: 600 });
  motion.advance(1 / 60);
  const current = { ...motion.point };
  motion.move({ x: 300, y: 200 }, { width: 800, height: 600 });
  expect(motion.point).toEqual(current);
  advanceToArrival(motion);
  expect(motion.point).toEqual({ x: 300, y: 200 });
});
