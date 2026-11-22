import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSleepClock } from './src/sleep.ts';

afterEach(() => vi.useRealTimers());
const context = () => ({ sessionID: 'session-a', signal: new AbortController().signal });

describe('clock lifetime and queue queries', () => {
  it('clears its timer and cancels the queue query on normal completion', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let querySignal;
    const clock = createSleepClock({ hasPendingInput: async (_, signal) => { querySignal = signal; return false; } });
    const sleeping = clock.sleep({ duration_ms: 20 }, context());
    await vi.advanceTimersByTimeAsync(20);
    expect(await sleeping).toMatchObject({ interrupted: false, wall_time_seconds: 0.02 });
    expect(querySignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    clock.close();
  });

  it('checks current queue state after queued input is delivered or cancelled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let queued = true;
    const clock = createSleepClock({ hasPendingInput: async () => queued });
    expect((await clock.sleep({ duration_ms: 10000 }, context())).interrupted).toBe(true);
    queued = false;
    const sleeping = clock.sleep({ duration_ms: 20 }, context());
    await vi.advanceTimersByTimeAsync(20);
    expect((await sleeping).interrupted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    clock.close();
  });

  it('cannot let a late queue response unregister a later sleep', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let resolveFirstQuery;
    const hasPendingInput = vi.fn(async () => false).mockImplementationOnce(() => new Promise(resolve => { resolveFirstQuery = resolve; }));
    const clock = createSleepClock({ hasPendingInput });
    const first = clock.sleep({ duration_ms: 20 }, context());
    await vi.advanceTimersByTimeAsync(20);
    expect((await first).interrupted).toBe(false);
    const second = clock.sleep({ duration_ms: 10000 }, context());
    resolveFirstQuery(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    clock.interrupt('session-a');
    expect((await second).interrupted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    clock.close();
  });

  it('cancels the sleep timer and inbox query when the runtime closes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let querySignal;
    const clock = createSleepClock({ hasPendingInput: async (_, signal) => { querySignal = signal; return false; } });
    const sleeping = clock.sleep({ duration_ms: 30000 }, context());
    const rejected = expect(sleeping).rejects.toThrow('Clock runtime closed');
    clock.close();
    await rejected;
    expect(querySignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports elapsed time to millisecond precision', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(125.973207);
    const clock = createSleepClock({ hasPendingInput: async () => true });
    expect((await clock.sleep({ duration_ms: 100 }, context())).wall_time_seconds).toBe(0.026);
    now.mockRestore();
    clock.close();
  });
});
