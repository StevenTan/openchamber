import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { isString } from '../shared/guards.js';
import type { McpInvocation, McpCallContext } from '../agent-tool/mcp-context.js';

export function createBackendMcpIdentity() {
  const sessions = new Map<string, string>();
  const tokens = new Map<string, string>();
  const identity = {
    authorize(headers: Record<string, string | string[] | undefined>) {
      const token = headers['x-openchamber-session'];
      return isString(token) && sessions.has(token);
    },
    token(sessionID: string) {
      let token = tokens.get(sessionID);
      if (!token) {
        token = randomBytes(32).toString('base64url');
        tokens.set(sessionID, token);
        sessions.set(token, sessionID);
      }
      return token;
    },
    reassign(from: string, to: string) {
      const token = identity.token(from);
      tokens.delete(from);
      tokens.set(to, token);
      sessions.set(token, to);
    },
    resolve(request: McpInvocation): McpCallContext | undefined {
      const header = request.requestInfo?.headers['x-openchamber-session'];
      const token = z.string().optional().parse(header ?? request._meta?.['openchamber/sessionToken']);
      if (!token) return;
      const sessionID = sessions.get(token);
      if (!sessionID) throw new Error('Unknown OpenChamber MCP session');
      return { sessionID, callID: String(request.requestId), signal: request.signal };
    },
  };
  return identity;
}
