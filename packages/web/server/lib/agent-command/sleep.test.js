import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSleepClock } from './src/sleep.ts';

afterEach(() => vi.useRealTimers());
const context = () => ({ sessionID: 'session-a', signal: new AbortController().signal });

describe('clock lifetime and queue queries', () => {
  it('clears its timer and cancels the queue query on normal completion', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let querySignal;
    const clock = createSleepClock({ hasPendingInput: async (_, signal) => { querySignal = signal; return false; } });
    const sleeping = clock.tool.execute({ duration_ms: 20 }, context());
    await vi.advanceTimersByTimeAsync(20);
    expect((await sleeping).metadata).toMatchObject({ interrupted: false, wall_time_seconds: 0.02 });
    expect(querySignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    clock.close();
  });

  it('checks current queue state after queued input is delivered or cancelled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let queued = true;
    const clock = createSleepClock({ hasPendingInput: async () => queued });
    expect((await clock.tool.execute({ duration_ms: 10000 }, context())).metadata.interrupted).toBe(true);
    queued = false;
    const sleeping = clock.tool.execute({ duration_ms: 20 }, context());
    await vi.advanceTimersByTimeAsync(20);
    expect((await sleeping).metadata.interrupted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    clock.close();
  });

  it('cannot let a late queue response unregister a later sleep', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let resolveFirstQuery;
    const hasPendingInput = vi.fn(async () => false).mockImplementationOnce(() => new Promise(resolve => { resolveFirstQuery = resolve; }));
    const clock = createSleepClock({ hasPendingInput });
    const first = clock.tool.execute({ duration_ms: 20 }, context());
    await vi.advanceTimersByTimeAsync(20);
    expect((await first).metadata.interrupted).toBe(false);
    const second = clock.tool.execute({ duration_ms: 10000 }, context());
    resolveFirstQuery(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    clock.interrupt('session-a');
    expect((await second).metadata.interrupted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    clock.close();
  });
});
