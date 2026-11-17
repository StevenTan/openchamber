import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { registerCollaborationRoutes } from './dist/runtime.js';

let handler, session, authorize, untrack, res, listHandler;
beforeEach(() => {
  session = {
    get: vi.fn(async () => ({ parentID: 'parent' })),
    wait: vi.fn(async () => {}),
    context: vi.fn(async () => [{ type: 'assistant', content: [{ type: 'text', text: 'Final answer' }] }]),
    list: vi.fn(async () => ({ data: [], cursor: {} })),
    active: vi.fn(async () => ({})),
  };
  authorize = vi.fn(() => true);
  untrack = vi.fn();
  registerCollaborationRoutes({ post: (path, _parser, callback) => {
    if (path.endsWith('subagent-wait')) handler = callback;
    if (path.endsWith('subagent-list')) listHandler = callback;
  } }, { json: () => ({}) }, { authorize, trackInflight: () => untrack, client: () => ({ session }) });
  res = Object.assign(new EventEmitter(), {
    writableEnded: false, destroyed: false, statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json: vi.fn(function (value) { this.writableEnded = true; this.body = value; return this; }),
  });
});
const req = () => ({ body: { sessionID: 'parent', target: 'child' } });

it('requires callback authentication before reading a session', async () => {
  authorize.mockReturnValue(false);
  await handler(req(), res);
  expect(res.statusCode).toBe(401);
  expect(session.get).not.toHaveBeenCalled();
});

it('verifies parent ownership at the server boundary', async () => {
  session.get.mockResolvedValue({ parentID: 'other' });
  await handler(req(), res);
  expect(res.statusCode).toBe(403);
  expect(session.wait).not.toHaveBeenCalled();
  expect(untrack).toHaveBeenCalledOnce();
});

it('returns the idle session latest assistant text and preserves error details', async () => {
  session.context.mockResolvedValue([{ type: 'assistant', content: [{ type: 'text', text: 'Earlier' }] }, { type: 'assistant', content: [{ type: 'text', text: 'Partial' }], error: { message: 'Failed' } }]);
  await handler(req(), res);
  expect(res.body).toEqual({ session_id: 'child', status: 'idle', output: 'Partial', error: { message: 'Failed' } });
  expect(untrack).toHaveBeenCalledOnce();
  expect(res.listenerCount('close')).toBe(0);
});

it('cancels the HTTP SDK wait and releases tracking on callback disconnect', async () => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  session.wait.mockImplementation((_input, { signal }) => new Promise((_resolve, reject) => {
    entered();
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const pending = handler(req(), res);
  await started;
  res.destroyed = true;
  res.emit('close');
  await pending;
  expect(session.wait.mock.calls[0][1].signal.aborted).toBe(true);
  expect(session.context).not.toHaveBeenCalled();
  expect(untrack).toHaveBeenCalledOnce();
  expect(res.listenerCount('close')).toBe(0);
});

it('surfaces a failed wait as an HTTP error', async () => {
  session.wait.mockRejectedValue(new Error('Upstream unavailable'));
  await handler(req(), res);
  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ error: 'Upstream unavailable' });
  expect(untrack).toHaveBeenCalledOnce();
});

it('rejects malformed wait requests before accessing the API', async () => {
  await handler({ body: { sessionID: 'parent' } }, res);
  expect(res.statusCode).toBe(400);
  expect(session.get).not.toHaveBeenCalled();
});

it('lists every direct-child page and derives state from the active registry', async () => {
  session.list
    .mockResolvedValueOnce({ data: [
      { id: 'working', title: 'Research', agent: 'explore' },
      { id: 'prepared', title: 'Prepared' },
    ], cursor: { next: 'next-page' } })
    .mockResolvedValueOnce({ data: [{ id: 'idle', agent: 'build' }], cursor: { next: null } });
  session.active.mockResolvedValue({ working: { type: 'running' }, unrelated: { type: 'running' } });
  await listHandler({ body: { sessionID: 'parent' } }, res);
  expect(res.body).toEqual({ agents: [
    { session_id: 'working', title: 'Research', agent: 'explore', status: 'running' },
    { session_id: 'idle', title: null, agent: 'build', status: 'idle' },
  ] });
  expect(session.list.mock.calls.map(([input]) => input)).toEqual([
    { parentID: 'parent' }, { parentID: 'parent', cursor: 'next-page' },
  ]);
  expect(untrack).toHaveBeenCalledOnce();
  expect(res.listenerCount('close')).toBe(0);
});

it('requires callback authentication before listing children', async () => {
  authorize.mockReturnValue(false);
  await listHandler({ body: { sessionID: 'parent' } }, res);
  expect(res.statusCode).toBe(401);
  expect(session.list).not.toHaveBeenCalled();
});

it('rejects malformed list requests before accessing the API', async () => {
  await listHandler({ body: {} }, res);
  expect(res.statusCode).toBe(400);
  expect(session.list).not.toHaveBeenCalled();
});

it.each(['page', 'active'])('reports %s failures without a partial listing', async failure => {
  session.list.mockResolvedValueOnce({ data: [{ id: 'child', agent: 'explore' }], cursor: { next: 'next-page' } });
  if (failure === 'page') session.list.mockRejectedValueOnce(new Error('Upstream unavailable'));
  else session.active.mockRejectedValue(new Error('Upstream unavailable'));
  await listHandler({ body: { sessionID: 'parent' } }, res);
  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ error: 'Upstream unavailable' });
  expect(untrack).toHaveBeenCalledOnce();
});

it('cancels an in-flight listing on callback disconnect', async () => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  session.list.mockImplementation((_input, { signal }) => new Promise((_resolve, reject) => {
    entered();
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const pending = listHandler({ body: { sessionID: 'parent' } }, res);
  await started;
  res.destroyed = true;
  res.emit('close');
  await pending;
  expect(session.list.mock.calls[0][1].signal.aborted).toBe(true);
  expect(session.active).not.toHaveBeenCalled();
  expect(untrack).toHaveBeenCalledOnce();
});
