import { createConnection } from '@playwright/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
export { chromium } from 'playwright-core';

const PLAYWRIGHT_TOOLS = [
  'browser_snapshot', 'browser_find', 'browser_click', 'browser_type',
  'browser_fill_form', 'browser_select_option', 'browser_press_key',
  'browser_hover', 'browser_drag', 'browser_wait_for', 'browser_evaluate',
  'browser_console_messages', 'browser_network_requests', 'browser_network_request',
  'browser_highlight', 'browser_hide_highlight',
  'browser_file_upload', 'browser_drop',
];

export const playwrightCallSchema = z.object({
  tool: z.enum(PLAYWRIGHT_TOOLS),
  arguments: z.record(z.string(), z.json()),
});

export async function createPlaywrightTools(contextGetter: Parameters<typeof createConnection>[1], { workspaceDir, outputDir }: { workspaceDir?: string | undefined; outputDir?: string | undefined } = {}) {
  const config: NonNullable<Parameters<typeof createConnection>[0]> = {
    capabilities: ['core', 'devtools'],
    timeouts: { action: 10_000, navigation: 30_000 },
    filePaths: 'absolute',
    allowUnrestrictedFileAccess: false,
  };
  if (outputDir !== undefined) config.outputDir = outputDir;
  const server = await createConnection(config, contextGetter);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'OpenChamber', version: '1' }, { capabilities: { roots: {} } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: workspaceDir ? [{ uri: pathToFileURL(workspaceDir).href }] : [] }));
  await client.connect(clientTransport);
  return {
    async initialize() {
      const result = await client.request({ method: 'tools/call', params: { name: 'browser_tabs', arguments: { action: 'list' } } }, CallToolResultSchema);
      if (result.isError) throw new Error(result.content.map(part => part.type === 'text' ? part.text : '').join('\n'));
    },
    async list() {
      const { tools } = await client.listTools();
      return tools.filter(tool => PLAYWRIGHT_TOOLS.includes(tool.name));
    },
    async call(input: z.input<typeof playwrightCallSchema>, options?: Parameters<Client['callTool']>[2]) {
      const call = playwrightCallSchema.parse(input);
      return client.callTool({ name: call.tool, arguments: call.arguments }, undefined, options);
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export async function getPlaywrightToolDefinitions() {
  const tools = await createPlaywrightTools(async () => {
    throw new Error('Browser tool discovery does not open a page');
  });
  try {
    return await tools.list();
  } finally {
    await tools.close();
  }
}
