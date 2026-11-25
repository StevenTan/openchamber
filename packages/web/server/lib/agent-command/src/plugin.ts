import { AGENT_MCP_SERVERS } from '../../agent-tool/catalog.js';
import { COMMAND_MCP_SERVER } from "./contracts.js";

export const COMMAND_PLUGIN_ID = "openchamber-command-tool";

export const createCommandPluginSource = () => String.raw`const commandServer = ${JSON.stringify(COMMAND_MCP_SERVER)}
const executeTool = commandServer + '_exec_command'
const stdinTool = commandServer + '_write_stdin'

export default {
  id: ${JSON.stringify(COMMAND_PLUGIN_ID)},
  async setup(ctx) {
    const endpoint = new URL(${JSON.stringify(AGENT_MCP_SERVERS.commands.path)}, process.env.OPENCHAMBER_AGENT_TOOL_URL).href
    const token = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN
    const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, '')
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const entries = (process.env[key] || '').split(',').map(value => value.trim()).filter(Boolean)
      if (!entries.includes(host)) process.env[key] = [...entries, host].join(',')
    }
    await ctx.tool.transform(tools => {
      tools.remove('shell')
      for (const name of [executeTool, stdinTool, commandServer + '_clock_sleep']) tools.update(name, tool => {
        const execute = tool.execute
        tool.execute = async (input, context) => {
          const result = await execute(input, context)
          const output = result.output
          result.metadata = { ...result.metadata, ...(name === commandServer + '_clock_sleep' ? output : {
            status: output.status, session_id: output.session_id, truncated: output.truncated,
            ...(output.status === 'completed' ? { exit_code: output.exit_code } : {}),
            ...(name === executeTool ? { command: input.cmd } : {}),
          }) }
          return result
        }
      })
    })
    await ctx.mcp.transform(servers => {
      servers.set(commandServer, {
        type: 'remote', url: endpoint, oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + token },
      })
    })
  },
}
`;
