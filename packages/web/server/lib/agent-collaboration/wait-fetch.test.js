import http from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { OpenCode } from '@opencode/client';
import { waitFetch } from './src/wait-fetch.ts';

let server, url;
beforeEach(async () => {
  server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

it('performs a real SDK wait with authentication and a delayed idle response', async () => {
  const requested = once(server, 'request');
  const sdk = OpenCode.make({ baseUrl: url, headers: { authorization: 'Bearer fixture' }, fetch: waitFetch });
  const pending = sdk.experimental.session.wait({ sessionID: 'child' });
  const [req, res] = await requested;
  expect(req.url).toBe('/api/experimental/session/child/wait');
  expect(req.headers.authorization).toBe('Bearer fixture');
  res.writeHead(204).end();
  await expect(pending).resolves.toBeUndefined();
});

it('closes the upstream wait connection when its signal is aborted', async () => {
  const requested = once(server, 'request');
  const controller = new AbortController();
  const pending = waitFetch(url, { method: 'POST', signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow();
  const [, res] = await requested;
  const closed = once(res, 'close');
  controller.abort();
  await rejected;
  await closed;
  expect(res.destroyed).toBe(true);
});

it('preserves an upstream HTTP failure and diagnostic body', async () => {
  server.on('request', (_req, res) => res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":"Unavailable"}'));
  const response = await waitFetch(url);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Unavailable' });
});
