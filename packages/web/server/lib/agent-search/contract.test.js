import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { materializeSearchPlugin } from './runtime.js';

let root;
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it('exposes one web.run tool with query operations only', async () => {
  const tools = [];
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'search-contract-'));
  const directory = await materializeSearchPlugin(root);
  const { default: plugin } = await import(pathToFileURL(path.join(directory, 'index.js')).href);
  await plugin.setup({
    options: {},
    websearch: {
      providers: async () => ({ data: [{ id: 'native' }] }),
      transform: async transform => transform({ add() {}, default: { get: () => 'native', set() {} } }),
    },
    tool: { transform: async transform => transform({ add: tool => tools.push(tool), remove() {}, namespace() {} }) },
    session: { hook: async () => {} },
    event: { async *subscribe() {} },
  });
  expect(tools.map(tool => [tool.options.namespace, tool.name])).toEqual([['web', 'run']]);
  expect(Object.keys(tools[0].input.properties)).toEqual([
    'search_query', 'image_query', 'open', 'click', 'find', 'finance', 'time', 'response_length',
  ]);
});
