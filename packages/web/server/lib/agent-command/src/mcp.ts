import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { commandTools, type CommandArguments, type RuntimeResult, type CommandToolContext, type CommandToolName } from "./contracts.js";
import { createMcpRuntime } from "../../agent-tool/mcp.js";

export type McpInvocation = Pick<RequestHandlerExtra<ServerRequest, ServerNotification>, "_meta">;

export function createCommandMcpRuntime(
  execute: (tool: CommandToolName, input: CommandArguments, context: CommandToolContext) => Promise<RuntimeResult>,
  resolveSessionID: (request: McpInvocation) => string,
) {
  return createMcpRuntime(() => createCommandMcpServer(execute, resolveSessionID));
}

function createCommandMcpServer(
  execute: (tool: CommandToolName, input: CommandArguments, context: CommandToolContext) => Promise<RuntimeResult>,
  resolveSessionID: (request: McpInvocation) => string,
) {
  const server = new McpServer({ name: "openchamber-commands", version: "1.0.0" });
  for (const name of ["exec_command", "write_stdin", "clock_sleep", "store", "load"] as const) {
    const definition = commandTools[name];
    server.registerTool(name, {
      description: definition.description,
      inputSchema: definition.input,
      outputSchema: definition.output,
    }, async (input: CommandArguments, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<CallToolResult> => {
      const result = await execute(name, input, { sessionID: resolveSessionID(extra), signal: extra.signal });
      return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
    });
  }
  return server;
}
