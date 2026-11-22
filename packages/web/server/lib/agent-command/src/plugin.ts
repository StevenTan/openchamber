import {
  createShellScanner,
  createPermissionParser,
} from "./vendor/shell-permissions.js";
import { commandShell } from "./process.js";
import { COMMAND_MCP_SERVER } from "./contracts.js";

export const COMMAND_PLUGIN_ID = "openchamber-command-tool";

export const createCommandPluginSource = () => String.raw`import { realpath } from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const scanner = (${createShellScanner.toString()})()
const parseCommand = (${createPermissionParser.toString()})(fs, os, path, scanner)
const defaultShell = ${JSON.stringify(commandShell())}
const commandServer = ${JSON.stringify(COMMAND_MCP_SERVER)}
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
    const approve = (context, action, resource, save = resource) => ctx.permission.assert({
      sessionID: context.sessionID, agent: context.agent, action,
      resources: [resource], save: [save],
      source: { type: 'tool', messageID: context.messageID, id: context.id },
    })
    const canonicalDirectory = async (directory) => {
      let existing = directory
      const remaining = []
      for (;;) {
        try { return path.join(await realpath(existing), ...remaining) }
        catch (error) {
          if (error.code !== 'ENOENT') throw error
          remaining.unshift(path.basename(existing))
          existing = path.dirname(existing)
        }
      }
    }
    await ctx.tool.transform(tools => {
      tools.remove('shell')
    })
    await ctx.tool.hook('execute.before', async context => {
      const input = context.input
      if (context.tool === executeTool) {
        const root = await realpath(ctx.location.directory)
        const workdir = await realpath(path.resolve(root, input.workdir || '.'))
        const shell = input.shell ?? defaultShell
        if (shell !== defaultShell) {
          const executable = "'" + shell.replaceAll("'", "'\"'\"'") + "'"
          await approve(context, 'shell', executable)
        }
        const parsed = parseCommand(input.cmd, shell, workdir)
        for (const directory of new Set([workdir, ...parsed.directories])) {
          const canonical = await canonicalDirectory(path.resolve(workdir, directory))
          const relative = path.relative(root, canonical)
          if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
            await approve(context, 'external_directory', canonical)
          }
        }
        for (const command of parsed.commands) {
          await approve(context, 'shell', command.resource, command.save)
        }
        context.input = { ...input, workdir, shell }
      }
      if (context.tool === stdinTool && input.chars && input.chars !== '\x03') {
        await approve(context, 'shell', input.chars)
      }
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
