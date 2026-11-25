import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, CallToolResultSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { Effect, Schema, type JsonSchema } from 'effect';
import { z } from 'zod';
import { createMcpRuntime } from '../agent-tool/mcp.js';
import type { ResolveMcpContext } from '../agent-tool/mcp-context.js';
import type { ToolPermissions } from '../agent-tool/permissions.js';
import { DIRECT_CONTROL_MCP_TOOLS } from '../agent-tool/control-mcp.js';
import { scriptRuntime, scriptOutput, type ScriptTool, type ScriptCall } from './src/execution.js';
import { fetchExtension } from './src/fetch.js';
import { toolResultMetadata } from '../agent-tool/tool-metadata.js';

export interface CodeModeSource {
  namespace: string;
  runtime: Pick<ReturnType<typeof createMcpRuntime>, 'createServer'>;
  permission(name: string): string;
  enabled?(): boolean;
}

const input = z.object({ code: z.string() });
const json = Schema.decodeUnknownSync(Schema.Json);
const object = Schema.decodeUnknownSync(Schema.JsonObject);

function toolSchema({ properties, required, ...schema }: Tool['inputSchema']): JsonSchema.JsonSchema {
  return { ...schema, ...properties && { properties }, ...required && { required } };
}


export function createCodeModeMcpRuntime(
  sources: readonly CodeModeSource[],
  resolveContext: ResolveMcpContext,
  permissions: ToolPermissions,
) {
  return createMcpRuntime(async () => {
    const clients = await Promise.all(sources.map(async source => {
      const child = await source.runtime.createServer();
      const [local, remote] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'openchamber-code-mode', version: '1.0.0' });
      await child.connect(remote);
      await client.connect(local);
      return { ...source, client, child };
    }));
    const inventory = async () => (await Promise.all(clients.filter(source => source.enabled?.() !== false).map(async source =>
      (await source.client.listTools()).tools.map(tool => ({ ...source, tool }))))).flat();
    const server = new Server({ name: 'openchamber-code-mode', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.onclose = () => { void Promise.all(clients.map(async ({ client, child }) => { await client.close(); await child.close(); })); };

    const descriptor = (entry: Awaited<ReturnType<typeof inventory>>[number], invoke: ScriptTool['execute']): ScriptTool => ({
      id: `${entry.namespace}_${entry.tool.name}`, path: `${entry.namespace}.${entry.tool.name}`,
      description: entry.tool.description ?? '', input: toolSchema(entry.tool.inputSchema),
      output: entry.tool.outputSchema ? toolSchema(entry.tool.outputSchema) : {}, execute: invoke,
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const entries = await inventory();
      const scriptEntries = entries.filter(entry => entry.namespace !== 'openchamber' || !DIRECT_CONTROL_MCP_TOOLS.includes(entry.tool.name));
      const { catalog } = scriptRuntime(scriptEntries.map(entry => descriptor(entry, () => Effect.die('Catalog only'))), () => Effect.void);
      const tool: Tool = { name: 'execute', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'], additionalProperties: false }, outputSchema: { type: 'object' },
        description: [
          'Run JavaScript with { code }. The complete catalog below supplies every available tools path, description and parameter signature. Call these paths directly. Await calls whose results matter; run independent calls with Promise.allSettled. Return the results needed for reasoning. Pending calls stop when the script ends.',
          'Tools also have direct MCP entries accepting the same JSON arguments. Prefer direct command and file calls for multiline scripts, source code and patches. fetch(url, init?) returns text(), json(), bytes(), status, ok, url and headers; it uses webfetch permissions.',
          ...catalog.map(entry => `## ${entry.path}\n\n${entry.description}\n\nDirect tool entry: \`${entry.path.replace('.', '_')}\`. JavaScript call:\n\n\`\`\`typescript\n${entry.signature}\n\`\`\``),
        ].join('\n\n'),
      };
      return { tools: [tool, ...entries.filter(entry => entry.namespace === 'openchamber').map(entry => entry.tool)] };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const sessionToken = extra.requestInfo?.headers['x-openchamber-session'];
      const meta = { ...extra._meta, ...sessionToken && { 'openchamber/sessionToken': sessionToken } };
      if (request.params.name !== 'execute') {
        const control = clients.find(source => source.namespace === 'openchamber');
        if (!control) throw new Error('OpenChamber control tools are unavailable');
        return control.client.callTool({ ...request.params, _meta: meta }, CallToolResultSchema, { signal: extra.signal, timeout: 43_200_000 });
      }
      const context = resolveContext(extra);
      const policy = await permissions.session(context.sessionID);
      await policy.assert({ action: 'execute', resources: ['*'], save: ['*'] }, context.signal);
      const entries = (await inventory()).filter(entry => (entry.namespace !== 'openchamber' || !DIRECT_CONTROL_MCP_TOOLS.includes(entry.tool.name)) && !policy.denied(entry.permission(entry.tool.name), '*'));
      const tools = entries.map(entry => descriptor(entry, args => Effect.tryPromise({ try: async signal => {
        const result = CallToolResultSchema.parse(await entry.client.callTool({ name: entry.tool.name, arguments: object(args), _meta: meta }, CallToolResultSchema, { signal, timeout: 43_200_000 }));
        const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
        if (result.isError) throw new Error(text);
        const value = json(result.structuredContent ?? (text || null));
        return { value, text, metadata: toolResultMetadata(entry.namespace, entry.tool.name, value, args),
          files: result.content.filter(part => part.type === 'image').map(part => ({ type: 'file' as const, uri: `data:${part.mimeType};base64,${part.data}`, mime: part.mimeType })),
        };
      }, catch: error => error })));
      const network = fetchExtension(
        (url, metadata) => Effect.tryPromise({ try: signal => policy.assert({ action: 'webfetch', resources: [url], save: ['*'], metadata }, signal), catch: error => error }),
        url => policy.denied('webfetch', url) ? Effect.fail(new Error(`Permission denied: webfetch ${url}`)) : Effect.void,
      );
      const progress = (calls: ScriptCall[]) => Effect.tryPromise({
        try: async () => {
          if (extra._meta?.progressToken !== undefined) await extra.sendNotification({ method: 'notifications/progress', params: {
            progressToken: extra._meta.progressToken, progress: calls.filter(call => call.status !== 'running').length,
            message: JSON.stringify({ toolCalls: calls }),
          } });
        }, catch: error => error,
      }).pipe(Effect.orDie);
      const { result, calls, files } = await Effect.runPromise(scriptRuntime(tools, progress, [network]).execute(input.parse(request.params.arguments).code), { signal: extra.signal });
      return { structuredContent: object(result), content: [{ type: 'text', text: scriptOutput(result) }, ...files.map(file => {
        const comma = file.uri.indexOf(',');
        return { type: 'image' as const, mimeType: file.mime, data: file.uri.slice(comma + 1) };
      })], _meta: { toolCalls: calls, openchamberToolCalls: calls } };
    });
    return server;
  }, { enableJsonResponse: false });
}
