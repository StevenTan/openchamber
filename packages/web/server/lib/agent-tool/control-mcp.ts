import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createMcpRuntime } from './mcp.js';
import type { ResolveMcpContext } from './mcp-context.js';
import type { ActionDefinition, AgentToolPayload, ParameterSchema, ResultFields } from './runtime.js';
import type { ControlOptions } from '../openchamber-control/service.js';
import type { ToolPermissions } from './permissions.js';
import { resolveAgentToolAction } from '../openchamber-control/actions.js';
import { secretRunCommand, secretRunCommandLine } from '../openchamber-control/secret-run.js';

export const CONTROL_MCP_TOOLS = ['openchamber_memory', 'openchamber_knowledge', 'openchamber_usage', 'openchamber_notify', 'openchamber_control', 'openchamber_schedule', 'openchamber_terminal', 'openchamber_render', 'openchamber_image', 'openchamber_secret'];
export const DIRECT_CONTROL_MCP_TOOLS = ['render', 'image', 'secret'];
export const controlMcpPermission = (name: string) => name === 'control' ? 'openchamber' : `openchamber_${name}`;
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

export function controlMcpInput(input: z.input<typeof inputSchema> | undefined, singleAction?: string) {
  const { action, parameters, ...flattened } = inputSchema.parse(input);
  const args = inputSchema.parse({ ...flattened, ...parameters, action });
  if (singleAction) {
    const revived = jsonString.pipe(inputSchema).safeParse(args.action);
    if (revived.success) {
      const { action: _action, parameters: nested, ...fields } = revived.data;
      for (const [field, value] of Object.entries({ ...fields, ...nested })) {
        if (!Object.hasOwn(args, field)) args[field] = value;
      }
    }
    args.action = singleAction;
  }
  return args;
}

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
      const args = controlMcpInput(request.params.arguments, tool.definitions.length === 1 ? tool.definitions[0]?.action : undefined);
      if (Object.hasOwn(tool.parameters, 'dependsOn')) {
        const revived = jsonString.pipe(z.array(z.json())).safeParse(args.dependsOn);
        if (revived.success) args.dependsOn = revived.data;
      }
      if (Object.hasOwn(tool.parameters, 'link')) {
        const revived = jsonString.pipe(z.record(z.string(), z.unknown())).safeParse(args.link);
        if (revived.success) args.link = revived.data;
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
        const permission = controlMcpPermission(tool.name);
        const policy = await permissions.session(context.sessionID);
        await policy.assert({ action: permission, resources: ['*'], save: ['*'] }, signal);
        const options: ControlOptions = { signal };
        if (tool.name === 'secret' && resolveAgentToolAction(args.action ?? null, permission).action === 'secret.run') {
          const command = secretRunCommand({ program: args.program, args: args.args });
          if (command.program === undefined) {
            const result = { schemaVersion: 1, ok: false, action: 'secret.run', error: { kind: 'usage', message: command.error } };
            return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          await policy.assert({ action: 'shell', resources: [secretRunCommandLine(command.program, command.args)], save: [command.program + ' *'] }, signal);
          options.secretRunAuthorized = true;
        }
        const result = await execute({ tool: permission, input: args, sessionID: context.sessionID, callID: context.callID }, options);
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
        type: 'remote', url: new URL('/api/openchamber/code-mode/mcp', process.env.OPENCHAMBER_AGENT_TOOL_URL).href,
        oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN },
      })
    })
    const controlTools = new Set(${JSON.stringify(CONTROL_MCP_TOOLS)})
    await ctx.tool.transform(tools => {
      for (const name of controlTools) tools.update(name, tool => {
        const permission = name === 'openchamber_control' ? 'openchamber' : name
        tool.options = { ...tool.options, permission }
        const execute = tool.execute
        tool.execute = async (input, context) => {
          const titles = ${JSON.stringify(titles)}
          await context.progress({ [permission]: { schemaVersion: 1, action: input.action, description: titles[input.action] ?? input.action } })
          const result = await execute(input, context)
          const output = result.output
          result.metadata = { ...result.metadata, openchamber: {
            schemaVersion: 1, action: output.action, description: titles[output.action] ?? output.action, ok: output.ok,
          } }
          return result
        }
      })
    })`;
}
