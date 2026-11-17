import {
  createShellScanner,
  createPermissionParser,
} from "./vendor/shell-permissions.js";
import { commandShell } from "./process.js";
import type { z } from "zod";
import { createSleepClock } from "./sleep.js";

export const COMMAND_PLUGIN_ID = "openchamber-command-tool";

export const createCommandPluginSource = (
  schemas: Record<"exec_command" | "write_stdin" | "output", z.core.JSONSchema.JSONSchema>,
) => String.raw`import { realpath } from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const scanner = (${createShellScanner.toString()})()
const parseCommand = (${createPermissionParser.toString()})(fs, os, path, scanner)
const defaultShell = ${JSON.stringify(commandShell())}

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
    const clock = (${createSleepClock.toString()})({
      hasPendingInput: async (sessionID, signal) => (await request('pending_input', sessionID, {}, signal)).pending,
    })
    const watchingInput = (async () => {
      try {
        for await (const event of ctx.event.subscribe({ types: ['session.inbox.enqueued'], signal: clock.signal })) {
          clock.interrupt(event.data.sessionID)
        }
        if (!clock.signal.aborted) throw new Error('Input event stream ended')
      } catch (error) {
        if (!clock.signal.aborted) {
          console.error('[agent-command] input event stream failed:', error)
          clock.close(new Error('Input event stream failed', { cause: error }))
        }
      }
    })()
    const approve = (context, action, resource, save = resource) => ctx.permission.assert({
      sessionID: context.sessionID, agent: context.agent, action,
      resources: [resource], save: [save],
      source: { type: 'tool', messageID: context.messageID, id: context.id },
    })
    const toolResult = (result) => ({
      output: result,
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
        description: 'Runs a command with stdin, stdout and stderr pipes by default. Use write_stdin to send input; send EOF with close_stdin when the program needs the end of its input. Set tty: true at launch for programs that require a terminal. The session mode is fixed at launch. Collects output until the wait ends or the process exits, returning a session ID for continuation. When status is running, continue with write_stdin using the returned session_id. Completed commands retain their session_id for output inspection; status and exit_code report completion.',
        options: { codemode: false },
        input: ${JSON.stringify(schemas.exec_command)},
        output: ${JSON.stringify(schemas.output)},
        async execute(input, context) {
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
          await context.progress({ command: input.cmd })
          const result = await request('exec_command', context.sessionID, { ...input, workdir, shell }, context.signal)
          const response = toolResult(result)
          response.metadata.command = input.cmd
          return response
        },
      })
      tools.add({
        name: 'write_stdin',
        description: 'Writes characters to an existing command session and returns recent output. Pipe sessions accept ordinary input and close_stdin: true sends EOF after the supplied chars, so final input and EOF need one call. Empty chars without close_stdin waits without writing. Ctrl+C interrupts either mode. The session mode is fixed at launch. Use status to check completion; completed sessions remain readable through offset and length.',
        options: { codemode: false },
        input: ${JSON.stringify(schemas.write_stdin)},
        output: ${JSON.stringify(schemas.output)},
        async execute(input, context) {
          if (input.chars && input.chars !== '\x03') await approve(context, 'shell', input.chars)
          const result = await request('write_stdin', context.sessionID, input, context.signal)
          return toolResult(result)
        },
      })
      tools.namespace({ name: 'clock', description: 'Tools for waiting on time.' })
      tools.add(clock.tool)
    })
    return async () => {
      clock.close()
      await watchingInput
    }
  },
}
`;
