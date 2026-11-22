import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Effect } from 'effect';
import { createMcpRuntime } from '../agent-tool/mcp.js';
import { fileCall, fileTools } from './contracts.js';
import { applyFileChanges, fileCallPaths, prepareFileMutation, resolveFile } from './files.js';
import { fileDiff } from './diff.js';
import { makeFileLocks } from './vendor/keyed-mutex.js';
import type { ResolveMcpContext } from '../agent-tool/mcp-context.js';
import type { ToolPermissions } from '../agent-tool/permissions.js';

const contains = (directory: string, file: string) => {
  const relative = path.relative(directory, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export function createFileMcpRuntime(permissions: ToolPermissions, resolveContext: ResolveMcpContext) {
  const withLock = makeFileLocks();
  return createMcpRuntime(() => {
    const server = new Server({ name: 'openchamber-files', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: fileTools }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { sessionID } = resolveContext(extra);
      const session = await permissions.session(sessionID);
      const { directory, projectDirectory } = session;
      const call = fileCall.parse({ name: request.params.name, input: request.params.arguments });
      const paths = fileCallPaths(call, directory);
      const external = paths.filter(file => !contains(directory, file)
        && (projectDirectory === path.parse(projectDirectory).root || !contains(projectDirectory, file)));
      if (external.length) {
        const resources = [...new Set(external.map(file => path.join(path.dirname(file), '*').replaceAll(path.sep, '/')))];
        await session.assert({ action: 'external_directory', resources, save: resources }, extra.signal);
      }
      const resources = paths.map(file => contains(directory, file) ? path.relative(directory, file).replaceAll(path.sep, '/') : file.replaceAll(path.sep, '/'));
      if (call.name === 'view_image') {
        await session.assert({ action: 'read', resources, save: ['*'] }, extra.signal);
        const path = resolveFile(directory, call.input.path);
        const bytes = await fs.readFile(path, { signal: extra.signal });
        const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
          : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'image/jpeg'
          : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii')) ? 'image/gif'
          : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' ? 'image/webp'
          : undefined;
        if (!mime) throw new Error('Expected a PNG, JPEG, GIF or WebP image. Read text with shell commands and use the pdf skill for PDFs.');
        return { structuredContent: { path, mime }, content: [{ type: 'image', mimeType: mime, data: bytes.toString('base64') }] };
      }
      const operation = Effect.tryPromise({ try: async () => {
        const changes = await prepareFileMutation(call, directory);
        await session.assert({ action: 'edit', resources, save: ['*'], metadata: { files: changes.map(fileDiff) } }, extra.signal);
        await applyFileChanges(changes, extra.signal);
        return { message: 'Success. Updated the following files:\n' + changes.map(change => change.file).join('\n'), files: changes.map(fileDiff) };
      }, catch: error => error });
      const result = await Effect.runPromise(fileCallPaths(call, directory).sort().reduceRight((effect, file) => withLock(file)(effect), operation), { signal: extra.signal });
      return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
    return server;
  });
}
