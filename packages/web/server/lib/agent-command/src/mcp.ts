import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { commandOutput, commandTools, type CommandArguments, type CommandResult, type CommandToolContext, type CommandToolName } from "./contracts.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const sessionHeader = z.string().optional();
export type McpInvocation = Pick<RequestHandlerExtra<ServerRequest, ServerNotification>, "_meta">;

export function createCommandMcpRuntime(
  execute: (tool: CommandToolName, input: CommandArguments, context: CommandToolContext) => Promise<CommandResult>,
  resolveSessionID: (request: McpInvocation) => string,
) {
  const connections = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();
  return {
    async handleRequest(req: IncomingMessage & { body: unknown }, res: ServerResponse & { status(code: number): { json(body: { error: string }): void } }) {
      const sessionID = sessionHeader.parse(req.headers["mcp-session-id"]);
      if (sessionID !== undefined) {
        const connection = connections.get(sessionID);
        if (!connection) {
          res.status(404).json({ error: "MCP session not found" });
          return;
        }
        await connection.transport.handleRequest(req, res, req.body);
        return;
      }
      const server = createCommandMcpServer(execute, resolveSessionID);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: id => { connections.set(id, { server, transport }); },
        onsessionclosed: id => { connections.delete(id); },
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      if (!transport.sessionId) await server.close();
    },
    async close() {
      const active = [...connections.values()];
      connections.clear();
      await Promise.all(active.map(connection => connection.server.close()));
    },
  };
}

function createCommandMcpServer(
  execute: (tool: CommandToolName, input: CommandArguments, context: CommandToolContext) => Promise<CommandResult>,
  resolveSessionID: (request: McpInvocation) => string,
) {
  const server = new McpServer({ name: "openchamber-commands", version: "1.0.0" });
  for (const name of ["exec_command", "write_stdin"] as const) {
    const definition = commandTools[name];
    server.registerTool(name, {
      description: definition.description,
      inputSchema: definition.input,
      outputSchema: commandOutput,
    }, async (input: CommandArguments, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<CallToolResult> => {
      const result = await execute(name, input, { sessionID: resolveSessionID(extra), signal: extra.signal });
      return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
    });
  }
  return server;
}
