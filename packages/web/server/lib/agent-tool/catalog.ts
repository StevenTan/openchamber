export const AGENT_MCP_SERVERS = {
  openchamber: { name: 'openchamber', path: '/api/openchamber/code-mode/mcp' },
  commands: { name: 'openchamber_commands', path: '/api/openchamber/command-tool/mcp' },
  file: { name: 'file', path: '/api/openchamber/file-tool/mcp' },
  browser: { name: 'browser', path: '/api/openchamber/browser-tool/mcp' },
  request: { name: 'request', path: '/api/openchamber/async-question/mcp' },
} as const;

