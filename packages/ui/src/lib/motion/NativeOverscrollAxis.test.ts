import { expect, test } from 'bun:test';
import { NativeOverscrollAxis } from './NativeOverscrollAxis';

test('holds its pull through a stationary contact until explicit release', () => {
  const axis = new NativeOverscrollAxis();
  axis.input(120, 0);
  const held = axis.advance(0);
  expect(held).toBe(28);
  expect(axis.advance(10_000)).toBe(held);
  axis.release(10_000);
  expect(axis.advance(10_050)).toBeLessThan(held);
  expect(axis.advance(12_000)).toBe(0);
  expect(axis.moving).toBe(false);
});

test('momentum release notifications do not restart the return', () => {
  const axis = new NativeOverscrollAxis();
  const control = new NativeOverscrollAxis();
  for (const item of [axis, control]) { item.input(360, 0); item.release(100); }
  for (let time = 110; time <= 2000; time += 10) {
    axis.release(time);
    expect(axis.advance(time)).toBeCloseTo(control.advance(time));
  }
});

test('reverse input consumes the pull without crossing to the opposite edge', () => {
  const axis = new NativeOverscrollAxis();
  axis.input(50, 0);
  axis.input(-100, 10);
  expect(axis.advance(10)).toBe(0);
  expect(axis.moving).toBe(false);
});

test('a new contact continues from the current returning displacement', () => {
  const axis = new NativeOverscrollAxis();
  axis.input(120, 0);
  axis.release(10);
  const current = axis.advance(100);
  axis.input(0, 100);
  expect(axis.advance(500)).toBeCloseTo(current);
});
