import fs from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Effect } from 'effect';
import { createMcpRuntime } from '../agent-tool/mcp.js';
import { fileCall, fileTools } from './contracts.js';
import { applyFileChanges, fileCallPaths, prepareFileMutation, resolveFile } from './files.js';
import { fileDiff } from './diff.js';
import { makeFileLocks } from './vendor/keyed-mutex.js';

export function createFileMcpRuntime(resolveDirectory: (sessionID: string) => Promise<string | null>) {
  const withLock = makeFileLocks();
  return createMcpRuntime(() => {
    const server = new Server({ name: 'openchamber-files', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: fileTools }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const sessionID = z.string().min(1).parse(extra._meta?.['ai.opencode/sessionID']);
      const directory = await resolveDirectory(sessionID);
      if (!directory) throw new Error('Session directory is unavailable');
      const call = fileCall.parse({ name: request.params.name, input: request.params.arguments });
      if (call.name === 'view_image') {
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
      const operation = Effect.tryPromise(async () => {
        const changes = await prepareFileMutation(call, directory);
        await applyFileChanges(changes, extra.signal);
        return { message: 'Success. Updated the following files:\n' + changes.map(change => change.file).join('\n'), files: changes.map(fileDiff) };
      });
      const result = await Effect.runPromise(fileCallPaths(call, directory).sort().reduceRight((effect, file) => withLock(file)(effect), operation), { signal: extra.signal });
      return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
    return server;
  });
}
