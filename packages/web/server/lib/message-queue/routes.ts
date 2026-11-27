import type { Application, Response as HttpResponse } from '../shared/http-contracts.js';
import type { createMessageQueueRuntime } from './runtime.js';
import { hasReadableFields, isInteger } from './records.js';

const hasQueueBody = (value: unknown): value is { item?: unknown; directory?: unknown; itemIds?: unknown } => value !== null && value !== undefined;
const hasScheduledTaskField = (value: unknown): value is { scheduledTask?: unknown } => value !== null && value !== undefined;

export function registerMessageQueueRoutes(app: Application, runtime: ReturnType<typeof createMessageQueueRuntime>) {
  const respondError = (res: HttpResponse, cause: unknown, fallback: string) => {
    const statusValue = hasReadableFields(cause) ? cause.status : undefined;
    const status = cause instanceof TypeError ? 400 : (isInteger(statusValue) ? statusValue : 500);
    res.status(status).json({ error: (hasReadableFields(cause) ? cause.message : undefined) ?? fallback });
  };

  app.get('/api/message-queue', async (_req, res) => {
    try {
      await runtime.load();
      res.json(runtime.snapshot());
    } catch (error) {
      respondError(res, error, 'Failed to load message queue');
    }
  });

  app.post('/api/message-queue/sessions/:sessionId/items', async (req, res) => {
    try {
      const body = req.body;
      if (hasQueueBody(body) && hasScheduledTaskField(body.item) && body.item.scheduledTask) throw new TypeError('scheduledTask is server-owned');
      res.json(await runtime.enqueue(req.params.sessionId, hasQueueBody(body) ? body.directory : undefined, hasQueueBody(body) ? body.item : undefined));
    } catch (error) {
      respondError(res, error, 'Failed to queue message');
    }
  });

  app.post('/api/message-queue/sessions/:sessionId/take', async (req, res) => {
    try {
      res.json(await runtime.takeAll(req.params.sessionId));
    } catch (error) {
      respondError(res, error, 'Failed to take queued messages');
    }
  });

  app.put('/api/message-queue/sessions/:sessionId/order', async (req, res) => {
    try {
      res.json(await runtime.reorder(req.params.sessionId, hasQueueBody(req.body) ? req.body.itemIds : undefined));
    } catch (error) {
      respondError(res, error, 'Failed to reorder queue');
    }
  });

  app.delete('/api/message-queue/sessions/:sessionId', async (req, res) => {
    try {
      res.json(await runtime.clear(req.params.sessionId));
    } catch (error) {
      respondError(res, error, 'Failed to clear queue');
    }
  });

  app.post('/api/message-queue/sessions/:sessionId/items/:itemId/take', async (req, res) => {
    try {
      res.json(await runtime.take(req.params.sessionId, req.params.itemId));
    } catch (error) {
      respondError(res, error, 'Failed to take queued message');
    }
  });

  app.delete('/api/message-queue/sessions/:sessionId/items/:itemId', async (req, res) => {
    try {
      res.json(await runtime.remove(req.params.sessionId, req.params.itemId));
    } catch (error) {
      respondError(res, error, 'Failed to remove queued message');
    }
  });
}
