import { AGENT_MCP_SERVERS } from './catalog.js';
import type { Application, ExpressFactory, Request } from '../shared/http-contracts.js';
import { createCodeModeMcpRuntime } from '../agent-code-mode/mcp.js';
import type { createMcpRuntime } from './mcp.js';
import type { ResolveMcpContext } from './mcp-context.js';
import type { ToolPermissions } from './permissions.js';
import { controlMcpPermission } from './control-mcp.js';

type Services = Record<'openchamber_commands' | 'file' | 'browser' | 'request' | 'openchamber', ReturnType<typeof createMcpRuntime>>;
interface Options {
  resolveContext: ResolveMcpContext;
  permissions: ToolPermissions;
  browserEnabled(): boolean;
  authorize(request: Pick<Request, 'socket' | 'headers'>): boolean;
}

export function createAgentMcpServices(services: Services, options: Options) {
  const codeMode = createCodeModeMcpRuntime([
    { namespace: 'openchamber_commands', runtime: services.openchamber_commands, permission: name => ['write_stdin', 'exec_command'].includes(name) ? 'shell' : `openchamber_commands_${name}` },
    { namespace: 'file', runtime: services.file, permission: name => name === 'view_image' ? 'read' : 'edit' },
    { namespace: 'browser', runtime: services.browser, permission: () => 'openchamber_web', enabled: options.browserEnabled },
    { namespace: 'request', runtime: services.request, permission: () => 'question' },
    { namespace: 'openchamber', runtime: services.openchamber, permission: controlMcpPermission },
  ], options.resolveContext, options.permissions);
  const routes = [
    [AGENT_MCP_SERVERS.browser.path, services.browser, '1mb'], [AGENT_MCP_SERVERS.request.path, services.request, '1mb'],
    [AGENT_MCP_SERVERS.file.path, services.file, '50mb'], ['/api/openchamber/control-tool/mcp', services.openchamber, '1mb'],
    [AGENT_MCP_SERVERS.openchamber.path, codeMode, '50mb'],
  ] as const;
  return {
    registerRoutes(app: Application, express: Pick<ExpressFactory, 'json'>) {
      for (const [route, mcp, limit] of routes) {
        app.all(route, express.json({ limit }), async (req, res) => {
          if (!options.authorize(req)) return res.status(401).json({ error: 'Unauthorized' });
          await mcp.handleRequest(req, res);
        });
      }
    },
    close: () => Promise.all(routes.map(([, mcp]) => mcp.close())),
  };
}
