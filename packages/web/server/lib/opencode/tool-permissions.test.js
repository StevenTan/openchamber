import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { OpenCode } from '@opencode/client';
import { expect, it, vi } from 'vitest';
import { createOpenCodeToolPermissions } from './tool-permissions.js';

it('matches SDK-encoded directories when listing shared permission requests', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'permission-adapter-'));
  const directory = path.join(dataDir, 'source directory');
  const agent = vi.fn(async () => ({ data: { permissions: [{ action: '*', resource: '*', effect: 'ask' }] } }));
  const make = vi.spyOn(OpenCode, 'make').mockImplementation(() => ({
    session: { get: async () => ({ agent: 'selected-agent', location: { directory } }) },
    agent: { get: agent }, location: { get: async () => ({ project: { directory } }) },
    permission: { saved: { list: async () => [] }, request: { list: async () => ({ location: { directory }, data: [] }) } },
  }));
  try {
    const permissions = createOpenCodeToolPermissions({ dataDir, buildOpenCodeUrl: () => 'http://127.0.0.1',
      getOpenCodeAuthHeaders: () => ({}), globalEventHub: { injectEvent: vi.fn() },
    });
    const pending = (await permissions.session('session')).assert({ action: 'edit', resources: ['file.txt'], save: ['*'] }, new AbortController().signal);
    const app = express();
    permissions.registerRoutes(app, express);
    const response = await request(app).get('/api/permission/request').set('x-opencode-directory', encodeURIComponent(directory)).expect(200);
    expect(response.body.data.map(entry => entry.sessionID)).toEqual(['session']);
    expect(agent).toHaveBeenCalledWith({ agentID: 'selected-agent' });
    await request(app).post(`/api/session/session/permission/${response.body.data[0].id}/reply`).send({ decision: 'once' }).expect(204);
    await pending;
  } finally {
    make.mockRestore();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
