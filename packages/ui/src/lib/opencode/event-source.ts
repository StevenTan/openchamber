import type { OpenCodeClient } from '@opencode/client'
import type { AgentEventSource, EventSubscriptionInput } from '../agent/event-source'
import { createEventPipeline as createPipeline, type EventTransport } from '../agent/event-pipeline'
import { createTurnBoundaryOrder } from './wire-admission'
import { classifyStreamPayload } from './stream-payload'
import { opencodeClient } from './client'
import { getRuntimeUrlResolver } from '../runtime-url'
import { openRuntimeWebSocket } from '../relay/runtime-socket'
import { syncDebug } from '@/sync/debug'

export function createEventPipeline({ sdk, ...input }: EventSubscriptionInput & { sdk: OpenCodeClient }) {
  const isStale = createTurnBoundaryOrder(syncDebug.pipeline.staleTurnBoundary)
  const source: EventTransport = {
    async *subscribe(options) { for await (const payload of sdk.event.subscribe(options)) yield { type: 'event', payload } },
    openSocket(lastEventId) {
      let base: string
      try { base = opencodeClient.getBaseUrl().replace(/\/$/, '') }
      catch { base = '/api' }
      return openRuntimeWebSocket(getRuntimeUrlResolver().websocket(`${base}/global/event/ws`, lastEventId ? { lastEventId } : undefined))
    },
    classify: (payload, directory) => classifyStreamPayload(payload, directory, isStale),
  }
  return createPipeline({ ...input, source })
}
export const createOpenCodeEventSource = (sdk: OpenCodeClient): AgentEventSource => ({
  identity: sdk,
  connect: input => createEventPipeline({ ...input, sdk }),
})
