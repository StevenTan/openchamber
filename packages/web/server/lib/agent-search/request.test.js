import { expect, it } from 'vitest';
import { executionOptions, searchContext } from './src/request.ts';

it('maps search modes and applies explicit per-call controls over plugin defaults', () => {
  const defaults = { mode: 'cached', max_output_tokens: 4000, search_context_size: 'low' };
  expect(executionOptions(defaults, {})).toEqual({ settings: { external_web_access: false, search_context_size: 'low', allowed_callers: ['direct'] }, max_output_tokens: 4000 });
  expect(executionOptions(defaults, { mode: 'live', max_output_tokens: 1200 })).toEqual({ settings: { external_web_access: true, search_context_size: 'low', allowed_callers: ['direct'] }, max_output_tokens: 1200 });
});

it('bounds assistant context to 1000 approximate tokens across all retained replies', () => {
  const result = searchContext([
    { id: 'u1', type: 'user', text: 'Previous user' },
    { id: 'a1', type: 'assistant', content: [{ type: 'text', text: '中'.repeat(2000) }] },
    { id: 'a2', type: 'assistant', content: [{ type: 'text', text: 'Additional reply' }] },
    { id: 'u2', type: 'user', text: 'Current user' },
    { id: 'active', type: 'assistant', model: { id: 'model', providerID: 'provider' }, content: [] },
  ], 'active');
  expect(result.input).toHaveLength(3);
  expect(result.input[1].content[0].text).toContain('tokens truncated');
  expect(Buffer.byteLength(result.input[1].content[0].text, 'utf8')).toBeLessThan(4100);
  expect(result.input[1].content[0].text).not.toContain('\uFFFD');
});

it('omits backend conversation input when the active context contains no user messages', () => {
  expect(searchContext([{ id: 'active', type: 'assistant', model: { id: 'model', providerID: 'provider' }, content: [] }], 'active')).toEqual({ model: { id: 'model', providerID: 'provider' } });
});
