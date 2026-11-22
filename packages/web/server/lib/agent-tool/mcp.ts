import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';

const sessionHeader = z.string().optional();

export function createMcpRuntime(createServer: () => Promise<Pick<Server, 'connect' | 'close'>> | Pick<Server, 'connect' | 'close'>) {
  const connections = new Map<string, { server: Pick<Server, 'close'>; transport: StreamableHTTPServerTransport }>();
  return {
    async handleRequest(req: IncomingMessage & { body: unknown }, res: ServerResponse & { status(code: number): { json(body: { error: string }): void } }) {
      const sessionID = sessionHeader.parse(req.headers['mcp-session-id']);
      if (sessionID !== undefined) {
        const connection = connections.get(sessionID);
        if (!connection) {
          res.status(404).json({ error: 'MCP session not found' });
          return;
        }
        await connection.transport.handleRequest(req, res, req.body);
        return;
      }
      const server = await createServer();
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
