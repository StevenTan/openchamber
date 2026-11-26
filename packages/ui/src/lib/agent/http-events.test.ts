import { test, expect } from 'bun:test';
import { createConversationEventSource } from './http-events';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '../runtime-url';
import { useAuthSessionStore } from '../runtime-auth-expiry';
import type { SyncEvent } from './events';

test('managed event subscription routes both backends and resumes fragmented SSE frames from its last cursor', async () => {
  const previousFetch = globalThis.fetch;
  const previousResolver = getRuntimeUrlResolver();
  configureRuntimeUrlResolver({ apiBaseUrl: 'http://127.0.0.1' });
  useAuthSessionStore.getState().markAuthenticated();
  const requests: string[] = [];
  const started = { type: 'session.status', properties: { sessionID: 'ses_standard', status: { type: 'busy' }, turnStart: { at: 1000, source: 'host' } } };
  const native = { type: 'message.part.delta', properties: { sessionID: 'ses_ag_native', messageID: 'msg_native', partID: 'part_native', field: 'text', delta: '你好' } };
  const idle = { type: 'session.idle', properties: { sessionID: 'ses_ag_native' } };
  let finish!: () => void;
  const completed = new Promise<void>(resolve => { finish = resolve; });
  const delivered: Array<{ directory: string; event: SyncEvent }> = [];
  const reconnects: Array<{ replayReset: boolean; replayed: boolean }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    const frames = requests.length === 1 ? [
      { type: 'ready', cursor: 'start', replayed: false, replayReset: false },
      { type: 'event', eventId: 'event-one', payload: { kind: 'events', hostNow: 2000, events: [{ directory: '/standard', event: started }, { directory: '/native', event: native }] } },
    ] : [
      { type: 'ready', cursor: 'event-two', replayed: true, replayReset: false },
      { type: 'event', eventId: 'event-two', payload: { kind: 'events', hostNow: 2000, events: [{ directory: '/native', event: idle }] } },
    ];
    const bytes = new TextEncoder().encode(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(''));
    return new Response(new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const source = createConversationEventSource();
  const connection = source.connect({ transport: 'sse', reconnectDelayMs: 0, onReconnect: details => reconnects.push(details), onEvents(directory, events) {
    delivered.push(...events.map(event => ({ directory, event })));
    if (delivered.length === 2) connection.reconnect();
    if (delivered.length === 3) finish();
  } });
  try {
    await completed;
    expect(delivered.map(item => item.directory)).toEqual(['/standard', '/native', '/native']);
    expect(delivered[1]?.event).toEqual(native);
    expect(delivered[2]?.event).toEqual(idle);
    const first = delivered[0]!.event;
    expect(first.type).toBe('session.status');
    if (first.type === 'session.status') expect(Math.abs(Date.now() - first.properties.turnStart!.at - 1000)).toBeLessThan(1000);
    expect(new URL(requests[1]!).searchParams.get('lastEventId')).toBe('event-one');
    expect(reconnects).toEqual([{ replayReset: false, replayed: false }, { replayReset: false, replayed: true }]);
  } finally {
    connection.cleanup();
    globalThis.fetch = previousFetch;
    setRuntimeUrlResolver(previousResolver);
  }
});
