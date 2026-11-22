export const PLAYWRIGHT_TOOLS = [
  'browser_snapshot', 'browser_find', 'browser_click', 'browser_type',
  'browser_fill_form', 'browser_select_option', 'browser_press_key',
  'browser_hover', 'browser_drag', 'browser_wait_for', 'browser_evaluate',
  'browser_console_messages', 'browser_network_requests', 'browser_network_request',
  'browser_highlight', 'browser_hide_highlight',
  'browser_file_upload', 'browser_drop',
];

export const BROWSER_MCP_TOOLS = ['browser_panel', ...PLAYWRIGHT_TOOLS];
