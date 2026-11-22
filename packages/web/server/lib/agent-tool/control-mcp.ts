import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createMcpRuntime } from './mcp.js';
import type { ResolveMcpContext } from './mcp-context.js';
import type { ActionDefinition, AgentToolPayload, ParameterSchema, ResultFields } from './runtime.js';
import type { ControlOptions } from '../openchamber-control/service.js';
import type { ToolPermissions } from './permissions.js';

export const CONTROL_MCP_TOOLS = ['openchamber_memory', 'openchamber_knowledge', 'openchamber_usage', 'openchamber_notify'];
export interface ControlMcpTool {
  name: string;
  description: string;
  definitions: readonly ActionDefinition[];
  parameters: Record<string, ParameterSchema>;
}
const inputSchema = z.object({ action: z.string().optional(), parameters: z.record(z.string(), z.unknown()).optional() }).catchall(z.unknown());
const jsonString = z.string().transform((value, context) => {
  try { return JSON.parse(value); }
  catch { context.addIssue({ code: 'custom', message: 'Invalid JSON' }); return z.NEVER; }
});

export function createControlMcpRuntime(
  getTools: () => ControlMcpTool[],
  execute: (payload: AgentToolPayload, options: ControlOptions) => Promise<ResultFields & { schemaVersion: number }>,
  resolveContext: ResolveMcpContext,
  trackInflight: (sessionID: string, controller: AbortController) => () => void,
  outputSchema: NonNullable<Tool['outputSchema']>,
  permissions: ToolPermissions,
) {
  return createMcpRuntime(() => {
    const server = new Server({ name: 'openchamber', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: getTools().map(tool => ({
      name: tool.name, description: tool.description,
      inputSchema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', ...tool.definitions.length > 1 && { enum: tool.definitions.map(entry => entry.action) },
            description: `OpenChamber action to perform (${tool.definitions.map(entry => `${entry.action}: ${entry.description}`).join('; ')})` },
          parameters: { type: 'object', properties: tool.parameters, additionalProperties: false, description: 'Inputs for the action; use an empty object when none are needed' },
        },
        required: tool.definitions.length > 1 ? ['action'] : [], additionalProperties: true,
      },
      outputSchema,
    })) }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const tool = getTools().find(tool => tool.name === request.params.name);
      if (!tool) throw new Error(`Unknown OpenChamber tool: ${request.params.name}`);
      const { action, parameters, ...flattened } = inputSchema.parse(request.params.arguments);
      const args = inputSchema.parse({ ...flattened, ...parameters, action });
      if (tool.definitions.length === 1) {
        const revived = jsonString.pipe(inputSchema).safeParse(args.action);
        if (revived.success) {
          const { action: _action, parameters: nested, ...fields } = revived.data;
          for (const [field, value] of Object.entries({ ...fields, ...nested })) {
            if (!Object.hasOwn(args, field)) args[field] = value;
          }
        }
        args.action = tool.definitions[0]?.action;
      }
      if (Object.hasOwn(tool.parameters, 'dependsOn')) {
        const revived = jsonString.pipe(z.array(z.json())).safeParse(args.dependsOn);
        if (revived.success) args.dependsOn = revived.data;
      }
      for (const [field, schema] of Object.entries(tool.parameters)) {
        if (schema.type !== 'boolean') continue;
        if (args[field] === 'true') args[field] = true;
        else if (args[field] === 'false') args[field] = false;
      }
      const context = resolveContext(extra);
      const controller = new AbortController();
      const untrack = trackInflight(context.sessionID, controller);
      const signal = AbortSignal.any([context.signal, controller.signal]);
      try {
        await (await permissions.session(context.sessionID)).assert({ action: `openchamber_${tool.name}`, resources: ['*'], save: ['*'] }, signal);
        const result = await execute({ tool: `openchamber_${tool.name}`, input: args, sessionID: context.sessionID, callID: context.callID }, { signal });
        signal.throwIfAborted();
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      } finally { untrack(); }
    });
    return server;
  });
}

export function controlMcpSetup(titles: Record<string, string>) {
  return String.raw`
    await ctx.mcp.transform(servers => {
      servers.set('openchamber', {
        type: 'remote', url: new URL('/api/openchamber/control-tool/mcp', process.env.OPENCHAMBER_AGENT_TOOL_URL).href,
        oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN },
      })
    })
    const controlTools = new Set(${JSON.stringify(CONTROL_MCP_TOOLS)})
    await ctx.tool.hook('execute.after', async event => {
      if (event.status !== 'completed' || !controlTools.has(event.tool)) return
      const result = event.result.output
      const titles = ${JSON.stringify(titles)}
      event.result.metadata = { ...event.result.metadata, openchamber: {
        schemaVersion: 1, action: result.action, description: titles[result.action] ?? result.action, ok: result.ok,
      } }
    })`;
}
