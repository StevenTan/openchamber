import { expect, test } from 'bun:test';
import type { ToolPart } from './model';
import { codeModeCallParts } from './code-mode-parts';

const part: ToolPart = {
  id: 'script', type: 'tool', sessionID: 'session', messageID: 'message', callID: 'call', tool: 'execute',
  state: { status: 'completed', input: { code: 'await tools.read({path:"a"})' }, output: 'Script summary', time: { start: 1, end: 10 } },
};

test('preserves each recorded call input, result, metadata and timing independently of the script result', () => {
  if (part.state.status !== 'completed') throw new Error('Expected completed script');
  const metadata = { files: [{ file: 'a', patch: '-before\n+after', additions: 1, deletions: 1 }] };
  const enriched: ToolPart = { ...part, state: { ...part.state, metadata: { openchamberToolCalls: [
    { tool: 'edit', input: { path: 'a', oldString: 'before', newString: 'after' }, output: 'Edited', metadata, status: 'completed', time: { start: 2, end: 3 } },
    { tool: 'read', input: { path: '/repo/a' }, status: 'error', error: 'Denied', time: { start: 4, end: 5 } },
  ] } } };
  const [edit, read] = codeModeCallParts(enriched);
  expect(edit?.state).toMatchObject({ input: { path: 'a' }, output: 'Edited', metadata, time: { start: 2, end: 3 } });
  expect(read?.state).toMatchObject({ status: 'error', error: 'Denied', input: { path: '/repo/a' } });
  expect(edit?.id).not.toBe(read?.id);
  if (!edit) throw new Error('Expected recorded edit');
  expect(codeModeCallParts(edit)).toEqual([]);
  expect(codeModeCallParts(part)).toEqual([]);
});
