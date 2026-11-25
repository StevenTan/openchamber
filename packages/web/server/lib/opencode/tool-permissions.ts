import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { OpenCode } from '@opencode/client';
import { z } from 'zod';
import { createToolPermissions, type ToolPermissionPolicy } from '../agent-tool/permissions.js';
import { registerToolPermissionRoutes } from '../agent-tool/permission-routes.js';
import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { Application, ExpressFactory } from '../shared/http-contracts.js';

interface Options {
  dataDir: string;
  buildOpenCodeUrl(path: string, query: string): string;
  getOpenCodeAuthHeaders(): Record<string, string>;
  globalEventHub: Pick<GlobalMessageStreamHub, 'injectEvent'>;
  applicationPolicy?(sessionID: string): ToolPermissionPolicy | undefined;
}

export function createOpenCodeToolPermissions(options: Options) {
  const client = (directory?: string) => OpenCode.make({
    baseUrl: options.buildOpenCodeUrl('/', '').replace(/\/$/, ''),
    headers: { ...options.getOpenCodeAuthHeaders(), ...directory && { 'x-opencode-directory': encodeURIComponent(directory) } },
  });
  const runtime = createToolPermissions({
    file: path.join(options.dataDir, 'tool-permissions.json'),
    readPolicy: async sessionID => {
      const application = options.applicationPolicy?.(sessionID);
      if (application) return application;
      const session = await client().session.get({ sessionID });
      const scoped = client(session.location.directory);
      const agentID = session.agent ?? (await scoped.config.get()).reduce((agent, entry) => entry.type === 'document' ? entry.info.default_agent ?? agent : agent, 'build');
      const [agent, location, saved] = await Promise.all([
        scoped.agent.get({ agentID }), scoped.location.get(), scoped.permission.saved.list(),
      ]);
      return { directory: session.location.directory, projectDirectory: location.project.directory,
        rules: [...agent.data.permissions, ...session.permissions ?? []],
        savedRules: saved.map(entry => ({ action: entry.action, resource: entry.resource, effect: 'allow' })),
      };
    },
    publish: (type, data, directory) => options.globalEventHub.injectEvent({ directory, spaceId: null,
      payload: { id: randomUUID(), created: Date.now(), type, data, location: { directory } },
    }),
  });
  const registerRoutes = (app: Application, parser: Pick<ExpressFactory, 'json'>) => registerToolPermissionRoutes(app, parser, {
    permissions: runtime,
    directory: async req => {
      const header = req.get('x-opencode-directory');
      return z.string().optional().parse(req.query.directory) ?? (header ? decodeURIComponent(header) : undefined);
    },
    listNative: async directory => client(directory).permission.request.list(),
  });
  return { ...runtime, registerRoutes };
}
