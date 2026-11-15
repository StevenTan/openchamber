import {
  createShellScanner,
  createPermissionParser,
} from "./vendor/shell-permissions.js";
import { commandShell } from "./process.js";
import type { z } from "zod";
import { createSleepClock } from "./sleep.js";

export const COMMAND_PLUGIN_ID = "openchamber-command-tool";

export const createCommandPluginSource = (
  schemas: Record<"exec_command" | "write_stdin", z.core.JSONSchema.JSONSchema>,
) => String.raw`import { realpath } from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const scanner = (${createShellScanner.toString()})()
const parseCommand = (${createPermissionParser.toString()})(fs, os, path, scanner)
const shell = ${JSON.stringify(commandShell())}

export default {
  id: ${JSON.stringify(COMMAND_PLUGIN_ID)},
  async setup(ctx) {
    const clock = (${createSleepClock.toString()})()
    const endpoint = new URL('/api/openchamber/command-tool', process.env.OPENCHAMBER_AGENT_TOOL_URL).href
    const token = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN
    const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, '')
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const entries = (process.env[key] || '').split(',').map(value => value.trim()).filter(Boolean)
      if (!entries.includes(host)) process.env[key] = [...entries, host].join(',')
    }
    const request = async (tool, sessionID, input, signal) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ tool, sessionID, input }),
        signal, timeout: false,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      return result
    }
    const approve = (context, action, resource, save = resource) => ctx.permission.assert({
      sessionID: context.sessionID, agent: context.agent, action,
      resources: [resource], save: [save],
      source: { type: 'tool', messageID: context.messageID, id: context.id },
    })
    const toolResult = (result) => ({
      content: JSON.stringify(result),
      metadata: { status: result.status, session_id: result.session_id, truncated: result.truncated,
        ...(result.status === 'completed' ? { exit_code: result.exit_code } : {}) },
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
      tools.add({
        name: 'exec_command',
        description: 'Runs a command in a PTY, returning output and a session ID for ongoing interaction. When status is running, continue with write_stdin using the returned session_id. Completed commands retain their session_id for output inspection; status and exit_code report completion.',
        options: { codemode: false },
        input: ${JSON.stringify(schemas.exec_command)},
        async execute(input, context) {
          const root = await realpath(ctx.location.directory)
          const workdir = await realpath(path.resolve(root, input.workdir || '.'))
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
          await context.progress({ command: input.cmd })
          const result = await request('exec_command', context.sessionID, { ...input, workdir }, context.signal)
          const response = toolResult(result)
          response.metadata.command = input.cmd
          return response
        },
      })
      tools.add({
        name: 'write_stdin',
        description: 'Writes characters to an existing command session and returns recent output. Empty chars waits without writing. Use status to check completion; completed sessions remain readable through offset and length.',
        options: { codemode: false },
        input: ${JSON.stringify(schemas.write_stdin)},
        async execute(input, context) {
          if (input.chars && input.chars !== '\x03') await approve(context, 'shell', input.chars)
          const result = await request('write_stdin', context.sessionID, input, context.signal)
          return toolResult(result)
        },
      })
      tools.namespace({ name: 'clock', description: 'Tools for waiting on time.' })
      tools.add(clock.tool)
    })
    await ctx.session.hook('prompt', event => clock.interrupt(event.sessionID))
    return () => clock.close()
  },
}
`;
