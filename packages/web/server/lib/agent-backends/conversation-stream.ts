import { classifyStreamPayload } from '@openchamber/sdk/conversations/stream-payload';
import { CONVERSATION_EVENTS_PATH, injectedConversationPayload, type ConversationStreamPayload } from '@openchamber/sdk/conversations/stream';
import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { Application } from '../shared/http-contracts.js';
import type { JsonValue, ForwardEventPayload } from '../event-stream/contracts.js';
import { z } from 'zod';
import type { SyncEvent } from '@openchamber/sdk/conversations/events';

type Frame = { type: 'ready'; replayReset: boolean; replayed: boolean; cursor: string | undefined }
  | { type: 'event'; payload: ConversationStreamPayload; eventId: string }
  | { type: 'heartbeat' };
type Listener = (frame: Frame) => boolean;
const replayFrame = z.object({ payload: z.json(), directory: z.string().optional() });

export type ConversationEventHub = Pick<GlobalMessageStreamHub, 'subscribeEvent' | 'subscribeStatus' | 'injectEvent' | 'flushPending' | 'cursor' | 'replayAfter'>;

export function createConversationStream(hub: ConversationEventHub, processForwardedEventPayload?: ForwardEventPayload, record?: (event: SyncEvent) => void, project?: (event: SyncEvent) => SyncEvent | undefined) {
  const listeners = new Set<Listener>();
  const frameFor = (payload: JsonValue, directory: string | undefined, eventId: string): Frame => {
    const injected = injectedConversationPayload(payload);
    const frame = injected ?? classifyStreamPayload(payload, directory, undefined, 'host');
    if (frame.kind === 'events') frame.events = frame.events.flatMap(item => {
      const event = project && !injected ? project(item.event) : item.event;
      return event ? [{ ...item, event }] : [];
    });
    return { type: 'event', eventId, payload: { ...frame, hostNow: Date.now() } };
  };
  const broadcast = (frame: Frame) => {
    for (const send of listeners) if (!send(frame)) listeners.delete(send);
  };
  const unsubscribe = hub.subscribeEvent(event => {
    const frame = frameFor(event.payload, event.directory, event.eventId);
    if (frame.type === 'event' && frame.payload.kind === 'events' && !injectedConversationPayload(event.payload)) {
      for (const item of frame.payload.events) record?.(item.event);
    }
    broadcast(frame);
    processForwardedEventPayload?.(event.payload, payload => hub.injectEvent({ payload, directory: event.directory, spaceId: event.spaceId }), { spaceId: event.spaceId });
  }, { spaces: true });
  const unsubscribeStatus = hub.subscribeStatus(status => {
    if (status.type === 'connect' && status.wasReady) broadcast({ type: 'ready', replayReset: true, replayed: false, cursor: hub.cursor() });
  });
  const connect = (send: Listener, cursor = '') => {
    hub.flushPending();
    const replay = hub.replayAfter(cursor);
    if (!send({ type: 'ready', replayReset: replay === null, replayed: Boolean(cursor) && replay !== null, cursor: hub.cursor() })) return () => {};
    if (replay) for (const entry of replay) {
      const raw = replayFrame.parse(JSON.parse(entry.serializedFrame));
      if (!send(frameFor(raw.payload, raw.directory, entry.eventId))) return () => {};
    }
    listeners.add(send);
    return () => { listeners.delete(send); };
  };
  const heartbeat = setInterval(() => broadcast({ type: 'heartbeat' }), 15_000);
  heartbeat.unref();
  return {
    connect,
    registerRoutes(app: Application) {
      app.get(CONVERSATION_EVENTS_PATH, (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const cursor = z.string().optional().parse(req.query.lastEventId);
        const stop = connect(frame => {
          if (res.write(`data: ${JSON.stringify(frame)}\n\n`)) return true;
          res.end();
          return false;
        }, cursor);
        res.on('close', stop);
      });
    },
    publish(events: SyncEvent[], directory: string) {
      const payload: JsonValue = JSON.parse(JSON.stringify({ type: 'openchamber:conversation', properties: { kind: 'events', events: events.map(event => ({ directory, event })) } }));
      hub.injectEvent({ payload, directory, spaceId: null });
    },
    close() { clearInterval(heartbeat); unsubscribe(); unsubscribeStatus(); listeners.clear(); },
  };
}
