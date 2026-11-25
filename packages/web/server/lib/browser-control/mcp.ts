import { AGENT_MCP_SERVERS } from '../agent-tool/catalog.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, CallToolResultSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createMcpRuntime } from '../agent-tool/mcp.js';
import type { AgentToolInput, AgentToolPayload, ResultFields } from '../agent-tool/runtime.js';
import type { ControlOptions } from '../openchamber-control/service.js';
import { getPlaywrightToolDefinitions } from './playwright.js';
import { recordMcpCall, type ResolveMcpContext } from '../agent-tool/mcp-context.js';
import type { ToolPermissions } from '../agent-tool/permissions.js';

const panelInput = z.object({ action: z.string(), parameters: z.record(z.string(), z.unknown()).optional() }).catchall(z.unknown());

export function createBrowserMcpRuntime(
  panel: Tool,
  execute: (payload: AgentToolPayload, options: ControlOptions) => Promise<ResultFields & { schemaVersion: number }>,
  trackInflight: (sessionID: string, controller: AbortController) => () => void,
  resolveContext: ResolveMcpContext,
  permissions: ToolPermissions,
) {
  return createMcpRuntime(async () => {
    const pageTools = await getPlaywrightToolDefinitions();
    const tools = [panel, ...pageTools.map(tool => ({
      ...tool,
      name: tool.name.replace(/^browser_/, ''),
      description: `${tool.description}\n\nOpen and manage panel tabs with browser_panel. tabId selects a tab listed by browser_panel action browser.snapshot; omission uses this session's page.`,
      inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, tabId: { type: 'string', description: "Browser panel tab id; defaults to this session's page." } } },
    }))];
    const server = new Server({ name: 'openchamber-browser', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const context = resolveContext(extra);
      return recordMcpCall(context, 'browser', request.params.name, request.params.arguments ?? {}, async () => {
        const { sessionID, callID } = context;
        let input: AgentToolInput;
        if (request.params.name === 'panel') {
          const { action, parameters, ...flattened } = panelInput.parse(request.params.arguments);
          input = { ...flattened, ...parameters, action };
          if (input.submit === 'true') input.submit = true;
          else if (input.submit === 'false') input.submit = false;
        } else {
          const { tabId, ...args } = request.params.arguments ?? {};
          input = { action: 'browser.playwright', tool: `browser_${request.params.name}`, arguments: args, tabId };
        }
        const controller = new AbortController();
        const signal = AbortSignal.any([extra.signal, controller.signal]);
        const untrack = trackInflight(sessionID, controller);
        try {
          await (await permissions.session(sessionID)).assert({ action: 'openchamber_web', resources: ['*'], save: ['*'] }, signal);
          const payload: AgentToolPayload = { tool: 'openchamber_web', input, sessionID, callID };
          const result = await execute(payload, { signal });
          signal.throwIfAborted();
          if (request.params.name === 'panel') return { structuredContent: { ...result }, content: [{ type: 'text', text: JSON.stringify(result) }] };
          if (!result.ok) throw new Error(result.error?.message);
          return CallToolResultSchema.parse(result.data);
        } finally {
          untrack();
        }
      });
    });
    return server;
  });
}

export function browserMcpSetup(titles: Record<string, string>) {
  return String.raw`
    await ctx.mcp.transform(servers => {
      servers.set(${JSON.stringify(AGENT_MCP_SERVERS.browser.name)}, {
        type: 'remote', url: new URL(${JSON.stringify(AGENT_MCP_SERVERS.browser.path)}, process.env.OPENCHAMBER_AGENT_TOOL_URL).href,
        oauth: false, codemode: false,
        headers: { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN },
      })
    })
    await ctx.tool.transform(tools => {
      tools.update('browser_panel', tool => {
        const execute = tool.execute
        tool.execute = async (input, context) => {
          const result = await execute(input, context)
          const output = result.output
          const titles = ${JSON.stringify(titles)}
          result.metadata = { ...result.metadata, openchamber: {
            schemaVersion: 1, action: output.action, description: titles[output.action] ?? output.action, ok: output.ok,
          } }
          return result
        }
      })
    })`;
}
