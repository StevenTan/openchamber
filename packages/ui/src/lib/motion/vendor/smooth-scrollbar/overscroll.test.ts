import { expect, test } from 'bun:test';
import { OverscrollAxis } from './overscroll';

const FRAME = 1000 / 60;

test('uses the upstream amplitude and position recurrence at 60 Hz', () => {
  const axis = new OverscrollAxis();
  axis.input(40, 0);
  expect(axis.advance(FRAME)).toBeCloseTo(6.4);
  expect(axis.advance(FRAME * 2)).toBeCloseTo(10.24);
});

test('samples the same trajectory on 60 and 120 Hz displays', () => {
  const slow = new OverscrollAxis();
  const fast = new OverscrollAxis();
  slow.input(40, 0);
  fast.input(40, 0);
  let slowPosition = 0;
  let fastPosition = 0;
  for (let index = 1; index <= 8; index += 1) {
    slowPosition = slow.advance(index * FRAME);
    fast.advance((index - 0.5) * FRAME);
    fastPosition = fast.advance(index * FRAME);
    expect(fastPosition).toBeCloseTo(slowPosition, 8);
  }
});

test('returning displacement ignores the same-direction inertial tail', () => {
  const axis = new OverscrollAxis();
  axis.input(200, 0);
  let previous = 0;
  let returning = false;
  for (let index = 1; index <= 180; index += 1) {
    const now = index * FRAME / 2;
    const position = axis.advance(now);
    if (position < previous) returning = true;
    if (returning) expect(position).toBeLessThanOrEqual(previous);
    axis.input(3, now);
    previous = position;
  }
  expect(returning).toBe(true);
  expect(previous).toBe(0);
  expect(axis.moving).toBe(false);
});

test('a quiet input gap releases the completed wheel lock', () => {
  const axis = new OverscrollAxis();
  axis.input(40, 0);
  for (let now = 8; now <= 1600; now += 8) {
    axis.advance(now);
    axis.input(1, now);
  }
  expect(axis.moving).toBe(false);
  axis.input(40, 1640);
  expect(axis.moving).toBe(true);
  expect(axis.advance(1640 + FRAME)).toBeGreaterThan(0);
});

test('opposite edges mirror each other and stay within the amplitude bound', () => {
  const top = new OverscrollAxis();
  const bottom = new OverscrollAxis();
  for (let now = 0; now < 200; now += 8) {
    top.input(200, now);
    bottom.input(-200, now);
    const position = top.advance(now);
    expect(Math.abs(position)).toBeLessThanOrEqual(56);
    expect(bottom.advance(now)).toBeCloseTo(-position);
  }
});

test('fractional trackpad input produces fractional feedback', () => {
  const axis = new OverscrollAxis();
  axis.input(0.25, 0);
  expect(axis.advance(FRAME / 2)).toBeGreaterThan(0);
});
