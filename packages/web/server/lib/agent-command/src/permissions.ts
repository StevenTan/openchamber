import fs from 'node:fs';
import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { createShellScanner, createPermissionParser } from './vendor/shell-permissions.js';
import { commandShell } from './process.js';
import { commandInput, stdinInput, type CommandArguments, type CommandToolContext, type CommandToolName } from './contracts.js';
import type { ToolPermissions } from '../../agent-tool/permissions.js';

const parseCommand = createPermissionParser(fs, os, path, createShellScanner());
const defaultShell = commandShell();
const canonicalDirectory = async (directory: string) => {
  let existing = directory;
  const remaining: string[] = [];
  for (;;) {
    try { return path.join(await realpath(existing), ...remaining); }
    catch (error) {
      if (z.object({ code: z.string() }).parse(error).code !== 'ENOENT') throw error;
      remaining.unshift(path.basename(existing));
      existing = path.dirname(existing);
    }
  }
};

export async function authorizeCommand(permissions: ToolPermissions, tool: CommandToolName, input: CommandArguments, context: CommandToolContext) {
  if (tool !== 'exec_command' && tool !== 'write_stdin') return input;
  const session = await permissions.session(context.sessionID);
  const approve = (action: string, resource: string, save = resource) =>
    session.assert({ action, resources: [resource], save: [save] }, context.signal);
  if (tool === 'write_stdin') {
    const args = stdinInput.parse(input);
    if (args.chars && args.chars !== '\x03') await approve('shell', args.chars);
    return args;
  }
  const args = commandInput.parse(input);
  const root = await realpath(session.directory);
  const workdir = await realpath(path.resolve(root, args.workdir || '.'));
  const shell = args.shell ?? defaultShell;
  if (shell !== defaultShell) await approve('shell', "'" + shell.replaceAll("'", "'\"'\"'") + "'");
  const parsed = parseCommand(args.cmd, shell, workdir);
  for (const directory of new Set([workdir, ...parsed.directories])) {
    const canonical = await canonicalDirectory(path.resolve(workdir, directory));
    const relative = path.relative(root, canonical);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      await approve('external_directory', canonical);
    }
  }
  for (const command of parsed.commands) await approve('shell', command.resource, command.save);
  return { ...args, workdir, shell };
}
