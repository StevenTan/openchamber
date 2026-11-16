import { expect, it } from 'vitest';
import { searchContext } from './src/request.ts';
import { options, searchSettings } from './src/commands.ts';

it('defaults web access to cached mode', () => {
  expect(searchSettings(options.parse({}))).toEqual({ allowed_callers: ['direct'], external_web_access: false });
});

it.each([['cached', false], ['indexed', 'indexed'], ['live', true]])('maps %s mode to the explicit backend setting', (mode, expected) => {
  expect(searchSettings(options.parse({ web_search: mode })).external_web_access).toBe(expected);
});

it('selects the last two user texts and intervening assistant text without tool, media or reasoning data', () => {
  const result = searchContext([
    { id: 'old', type: 'user', text: 'Old' },
    { id: 'u1', type: 'user', text: 'Previous', files: [{ uri: 'secret' }] },
    { id: 'a1', type: 'assistant', content: [{ type: 'text', text: 'Reply' }, { type: 'reasoning', text: 'Private' }, { type: 'tool', state: { content: 'File bytes' } }] },
    { id: 'u2', type: 'user', text: 'Current' },
    { id: 'active', type: 'assistant', model: { id: 'model', providerID: 'provider' }, content: [{ type: 'text', text: 'Current commentary' }] },
    { id: 'future', type: 'user', text: 'Future' },
  ], 'active');
  expect(result.model).toEqual({ id: 'model', providerID: 'provider' });
  expect(result.input.map(message => message.content[0].text)).toEqual(['Previous', 'Reply', 'Current']);
});

it('shares the assistant context budget across messages without splitting UTF-8 characters', () => {
  const result = searchContext([
    { id: 'u1', type: 'user', text: 'Previous' },
    { id: 'a1', type: 'assistant', content: [{ type: 'text', text: '中'.repeat(2000) }] },
    { id: 'a2', type: 'assistant', content: [{ type: 'text', text: 'Extra reply' }] },
    { id: 'u2', type: 'user', text: 'Current' },
    { id: 'active', type: 'assistant', model: { id: 'model', providerID: 'provider' }, content: [] },
  ], 'active');
  expect(result.input).toHaveLength(3);
  expect(result.input[1].content[0].text).toContain('tokens truncated');
  expect(result.input[1].content[0].text).not.toContain('\uFFFD');
});
