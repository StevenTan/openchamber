import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';
import { adaptFileTools } from './src/file-tools.ts';

const context = { sessionID: 's', agent: 'build', messageID: 'm', id: 'c' };
function fixture(result, execute = () => Effect.succeed(result)) {
  const calls = [];
  const tools = new Map([
    ['read', { name: 'read', input: Schema.Struct({ path: Schema.String, offset: Schema.optionalKey(Schema.Int), limit: Schema.optionalKey(Schema.Number) }), options: { codemode: false }, execute: (input, context) => { calls.push({ input, context }); return execute(input, context); } }],
  ]);
  adaptFileTools({ get: id => tools.get(id), remove: id => tools.delete(id), add: tool => tools.set(tool.name, tool) });
  return { tools, calls };
}

it('exposes image viewing with native attachments and a compact structured result', async () => {
  const native = { output: { content: 'IMAGE_BYTES' }, content: [{ type: 'text', text: 'Image read successfully' }, { type: 'file', mime: 'image/png', uri: 'data:image/png;base64,IMAGE_BYTES', name: 'page.png' }], metadata: { truncated: false } };
  const { tools, calls } = fixture(native);
  expect(tools.has('read')).toBe(false);
  const image = tools.get('view_image');
  expect(Object.keys(image.input.fields)).toEqual(['path']);
  expect(image.options).toMatchObject({ permission: 'read', codemode: true, pinned: true });
  const result = await Effect.runPromise(image.execute({ path: 'page.png' }, context));
  expect(result.output).toEqual({ path: 'page.png', mime: 'image/png' });
  expect(result.content).toBe(native.content);
  expect(result.metadata).toBe(native.metadata);
  expect(calls).toEqual([{ input: { path: 'page.png' }, context }]);
});

it.each([
  { content: 'Text file contents' },
  { content: 'Directory listing' },
  { content: [{ type: 'file', mime: 'application/pdf', uri: 'data:application/pdf;base64,PDF' }] },
])('rejects non-image content instead of attaching it', async native => {
  const { tools } = fixture(native);
  await expect(Effect.runPromise(tools.get('view_image').execute({ path: 'input' }, context))).rejects.toThrow('Expected a PNG');
});

it('preserves native read failures', async () => {
  const { tools } = fixture(null, () => Effect.fail(new Error('Read permission denied')));
  await expect(Effect.runPromise(tools.get('view_image').execute({ path: 'private.png' }, context))).rejects.toThrow('Read permission denied');
});

it('respects configurations without the native reader', () => {
  const tools = new Map();
  adaptFileTools({ get: id => tools.get(id), remove: id => tools.delete(id), add: tool => tools.set(tool.name, tool) });
  expect(tools.size).toBe(0);
});
