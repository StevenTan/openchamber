import { expect, it } from 'vitest';
import { getPlaywrightToolDefinitions, playwrightCallSchema } from './playwright.js';

it('discovers upstream page tools without opening a browser', async () => {
  const tools = await getPlaywrightToolDefinitions();
  const names = tools.map(tool => tool.name);
  expect(names).toEqual(expect.arrayContaining(['browser_snapshot', 'browser_click', 'browser_type', 'browser_wait_for', 'browser_evaluate', 'browser_press_key', 'browser_file_upload']));
  const click = tools.find(tool => tool.name === 'browser_click');
  expect(click.inputSchema.properties.target.type).toBe('string');
  expect(click.description).toBeTruthy();
  expect(names).not.toContain('browser_run_code_unsafe');
  expect(names).not.toContain('browser_tabs');
  expect(names).not.toContain('browser_close');
  expect(names).not.toContain('browser_navigate');
  expect(names).not.toContain('browser_handle_dialog');
});

it('rejects unsupported page tools at the page boundary', () => {
  expect(playwrightCallSchema.parse({ tool: 'browser_click', arguments: { target: 'e5' } })).toEqual({ tool: 'browser_click', arguments: { target: 'e5' } });
  for (const tool of ['browser_run_code_unsafe', 'browser_tabs', 'browser_close', 'browser_navigate', 'browser_handle_dialog']) {
    expect(playwrightCallSchema.safeParse({ tool, arguments: {} }).success).toBe(false);
  }
});
