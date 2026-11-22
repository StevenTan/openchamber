import { expect, it } from 'vitest';
import { createSessionMemory } from './src/session-memory.ts';

function fixture() {
  const memory = createSessionMemory();
  const call = async (name, input, sessionID = 'session-a') => {
    const result = memory[name](input, sessionID);
    return name === 'load' ? result.value : result;
  };
  return { memory, call };
}

it('saves JSON snapshots across calls and overwrites existing keys', async () => {
  const { call } = fixture();
  const value = { items: [1, true, null, { text: '你好' }] };
  expect(await call('store', { key: 'result', value })).toEqual({ key: 'result' });
  value.items.push('input changed');
  const loaded = await call('load', { key: 'result' });
  expect(loaded).toEqual({ items: [1, true, null, { text: '你好' }] });
  loaded.items.push('output changed');
  expect(await call('load', { key: 'result' })).toEqual({ items: [1, true, null, { text: '你好' }] });
  await call('store', { key: 'result', value: 'replacement' });
  expect(await call('load', { key: 'result' })).toBe('replacement');
});

it('isolates keys by the native calling session', async () => {
  const { call } = fixture();
  await call('store', { key: 'result', value: 'A' });
  await expect(call('load', { key: 'result' }, 'session-b')).rejects.toThrow('No stored value');
  await call('store', { key: 'result', value: 'B' }, 'session-b');
  expect(await call('load', { key: 'result' })).toBe('A');
  expect(await call('load', { key: 'result' }, 'session-b')).toBe('B');
});

it('distinguishes saved null and false values from missing keys', async () => {
  const { call } = fixture();
  for (const value of [null, false, 0, '']) {
    await call('store', { key: 'result', value });
    expect(await call('load', { key: 'result' })).toBe(value);
  }
  await expect(call('load', { key: 'missing' })).rejects.toThrow("No stored value for key 'missing'");
  expect(await call('load', { key: 'result' })).toBe('');
});

it('clears one session while retaining other sessions', async () => {
  const { memory, call } = fixture();
  await call('store', { key: 'result', value: 'A' });
  await call('store', { key: 'result', value: 'B' }, 'session-b');
  memory.clear('session-a');
  await expect(call('load', { key: 'result' })).rejects.toThrow('No stored value');
  expect(await call('load', { key: 'result' }, 'session-b')).toBe('B');
});
