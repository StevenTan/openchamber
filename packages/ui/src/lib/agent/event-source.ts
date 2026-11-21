import type { SpaceCreationStep, SpaceTaskTitle } from "@/lib/spaces/spaces-api"
import type { SyncEvent } from "@/lib/agent/events"

export type SpaceProgress = { spaceId: string; step: SpaceCreationStep | "failed" | "removed"; failure: { code: string; message: string } | null }

type EventDelivery = {
  onEvent: (directory: string, payload: SyncEvent) => void
  onEvents?: never
} | {
  onEvent?: never
  onEvents: (directory: string, payloads: readonly SyncEvent[]) => void
}

export type EventSubscriptionInput = {
  routeDirectory?: (directory: string, payload: SyncEvent) => string
  onReconnect?: (details: { replayReset: boolean; replayed: boolean }) => void
  onDisconnect?: (reason: string) => void
  onTransportSwitch?: () => void
  onSpaceStream?: (details: { spaceId: string; status: "connected" | "disconnected"; wasReady: boolean }) => void
  onSpaceProgress?: (details: SpaceProgress) => void
  onSpaceTaskTitle?: (spaceId: string, taskTitle: SpaceTaskTitle | null) => void
  onSpaceSetup?: (spaceId: string) => void
  onSpacePermissionStream?: (spaceId: string) => void
  onStreamActivity?: () => void
  transport?: "auto" | "ws" | "sse"
  heartbeatTimeoutMs?: number
  reconnectDelayMs?: number
  wsReadyTimeoutMs?: number
} & EventDelivery

export type EventSubscription = {
  cleanup: () => void
  reconnect: (reason?: string) => void
}

export interface AgentEventSource {
  readonly identity: object
  connect(input: EventSubscriptionInput): EventSubscription
}
