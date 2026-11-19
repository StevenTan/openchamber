import { describe, expect, test } from 'bun:test';
import { createSessionPredictionCache, type PredictionTarget } from './sessionPrediction';

const target = (revision = 1, key = 'session'): PredictionTarget => ({ key, revision, sessionID: key, directory: '/project' });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function controlled() {
  const calls: Array<{ signal: AbortSignal; resolve: (text: string) => void }> = [];
  const cache = createSessionPredictionCache((_target, signal) => new Promise<string>((resolve) => calls.push({ signal, resolve })));
  return { cache, calls };
}

describe('session predictions', () => {
  test('shares one result per idle boundary, including dismissal and no prediction', async () => {
    const { cache, calls } = controlled();
    cache.load(target());
    cache.load(target());
    expect(calls).toHaveLength(1);
    calls[0].resolve('{"suggestion":"安装一下"}');
    await settle();
    expect(cache.get('session', 1)).toEqual({ status: 'ready', text: '安装一下' });
    cache.dismiss('session', 1);
    cache.load(target());
    expect(calls).toHaveLength(1);
    expect(cache.get('session', 1)?.text).toBeNull();
    cache.load(target(2));
    calls[1].resolve('{"suggestion":null}');
    await settle();
    cache.load(target(2));
    expect(calls).toHaveLength(2);
    expect(cache.get('session', 2)).toEqual({ status: 'ready', text: null });
  });

  test('a newer turn cancels pending generation and rejects late results', async () => {
    const { cache, calls } = controlled();
    cache.load(target());
    cache.load(target(2));
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].resolve('{"suggestion":"旧结果"}');
    await settle();
    expect(cache.get('session', 2)?.status).toBe('pending');
    calls[1].resolve('{"suggestion":"新结果"}');
    await settle();
    expect(cache.get('session', 2)?.text).toBe('新结果');
    expect(cache.get('session', 1)).toBeNull();
  });

  test('empty native text means no prediction; malformed output is a failed attempt', async () => {
    const { cache, calls } = controlled();
    cache.load(target());
    calls[0].resolve('');
    await settle();
    expect(cache.get('session', 1)).toEqual({ status: 'ready', text: null });
    cache.load(target(2));
    calls[1].resolve('{"suggestion":42}');
    await settle();
    expect(cache.get('session', 2)).toEqual({ status: 'error', text: null });
    cache.load(target(2));
    expect(calls).toHaveLength(2);
  });

  test('clearing a runtime cancels every request and ignores its completions', async () => {
    const { cache, calls } = controlled();
    cache.load(target());
    cache.load(target(1, 'other'));
    cache.clear();
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
    for (const call of calls) call.resolve('{"suggestion":"旧环境"}');
    await settle();
    expect(cache.get('session', 1)).toBeNull();
    expect(cache.get('other', 1)).toBeNull();
  });

  test('keeps pending requests owned and bounds completed results', async () => {
    const { cache, calls } = controlled();
    for (let i = 0; i < 65; i++) cache.load(target(1, String(i)));
    expect(calls.every((call) => !call.signal.aborted)).toBe(true);
    for (const call of calls) call.resolve('{"suggestion":null}');
    await settle();
    expect(cache.get('0', 1)).toBeNull();
    expect(cache.get('64', 1)?.status).toBe('ready');
  });

  test('accepts 240-character messages and rejects longer predictions', async () => {
    const { cache, calls } = controlled();
    cache.load(target());
    calls[0].resolve(JSON.stringify({ suggestion: '字'.repeat(240) }));
    await settle();
    expect(cache.get('session', 1)).toEqual({ status: 'ready', text: '字'.repeat(240) });
    cache.load(target(2));
    calls[1].resolve(JSON.stringify({ suggestion: '字'.repeat(241) }));
    await settle();
    expect(cache.get('session', 2)).toEqual({ status: 'error', text: null });
  });
});
