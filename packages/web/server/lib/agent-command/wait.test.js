import { describe, expect, it } from 'vitest';
import { commandWait, continuationWait } from './src/wait.ts';

describe('command wait windows', () => {
  it('bounds command collection between 250 ms and 30 seconds', () => {
    expect(commandWait(0, 'darwin')).toBe(250);
    expect(commandWait(10000, 'darwin')).toBe(10000);
    expect(commandWait(60000, 'darwin')).toBe(30000);
  });

  it('gives Windows command startup at least ten seconds', () => {
    expect(commandWait(250, 'win32')).toBe(10000);
  });

  it('defaults interactive writes to 250 ms and caps them at 30 seconds', () => {
    expect(continuationWait('hello')).toBe(250);
    expect(continuationWait('hello', 0)).toBe(250);
    expect(continuationWait('hello', 60000)).toBe(30000);
  });

  it('defaults empty waits to five seconds and permits up to five minutes', () => {
    expect(continuationWait('')).toBe(5000);
    expect(continuationWait('', 100)).toBe(5000);
    expect(continuationWait('', 300000)).toBe(300000);
    expect(continuationWait('', 600000)).toBe(300000);
  });

  it('treats EOF without text as an input operation', () => {
    expect(continuationWait('', undefined, true)).toBe(250);
    expect(continuationWait('', 1000, true)).toBe(1000);
  });
});
