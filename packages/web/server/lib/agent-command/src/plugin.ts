import { COMMAND_MCP_SERVER } from "./contracts.js";

export const COMMAND_PLUGIN_ID = "openchamber-command-tool";

export const createCommandPluginSource = () => String.raw`const commandServer = ${JSON.stringify(COMMAND_MCP_SERVER)}
const executeTool = commandServer + '_exec_command'
const stdinTool = commandServer + '_write_stdin'

export default {
  id: ${JSON.stringify(COMMAND_PLUGIN_ID)},
  async setup(ctx) {
    const endpoint = new URL('/api/openchamber/command-tool', process.env.OPENCHAMBER_AGENT_TOOL_URL).href
    const token = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN
    const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, '')
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const entries = (process.env[key] || '').split(',').map(value => value.trim()).filter(Boolean)
      if (!entries.includes(host)) process.env[key] = [...entries, host].join(',')
    }
    await ctx.tool.transform(tools => {
      tools.remove('shell')
    })
    await ctx.tool.hook('execute.after', async event => {
      if (event.status === 'completed' && event.tool === commandServer + '_clock_sleep') {
        event.result.metadata = { ...event.result.metadata, ...event.result.output }
      }
      if (event.status !== 'completed' || (event.tool !== executeTool && event.tool !== stdinTool)) return
      const result = event.result.output
      event.result.metadata = {
        ...event.result.metadata,
        status: result.status, session_id: result.session_id, truncated: result.truncated,
        ...(result.status === 'completed' ? { exit_code: result.exit_code } : {}),
        ...(event.tool === executeTool ? { command: event.input.cmd } : {}),
      }
    })
    await ctx.mcp.transform(servers => {
      servers.set(commandServer, {
        type: 'remote', url: endpoint + '/mcp', oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + token },
      })
    })
  },
}
`;
