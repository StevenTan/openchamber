import type { OpenCodeEvent } from "@opencode/client"
import { z } from "zod"
import { routeWireEvent } from "./events"
import { wireEventSchema, type StaleWireEventCheck } from "./wire-admission"
import { GLOBAL_EVENT_DIRECTORY, hostTurnStart, type SyncEvent } from "../agent/events"
import type { Metadata } from "../agent/model"
import type { SpaceProgress } from "../agent/event-source"
import { spaceCreationStepSchema, spaceTaskTitleSchema } from "@/lib/spaces/spaces-api"
import { workflowRunSchema } from "@/lib/workflows/model"

const openchamberStatusSchema = z.object({
  type: z.literal("openchamber:session-status"),
  properties: z.object({
    sessionID: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    status: z.enum(["idle", "busy", "retry"]),
    metadata: z.object({ attempt: z.number(), message: z.string(), next: z.number() }).partial().optional(),
    timestamp: z.number().optional(),
    turnStartedAt: z.number().optional(),
  }),
})

const openchamberArchivedSchema = z.object({
  type: z.literal("openchamber:session-archived"),
  properties: z.object({ sessionID: z.string().min(1), archivedAt: z.number().nullable() }),
})

const openchamberMetadataSchema = z.object({
  type: z.literal("openchamber:session-metadata"),
  properties: z.object({ sessionID: z.string().min(1), metadata: z.record(z.string(), z.unknown()) }),
})

const openchamberNotificationSchema = z.object({
  type: z.literal("openchamber:notification"),
  properties: z
    .object({
      kind: z.string(),
      sessionId: z.string(),
      directory: z.string(),
      title: z.string(),
      body: z.string(),
      tag: z.string(),
      requireHidden: z.boolean(),
      showWhenFocused: z.boolean(),
      toastOnly: z.boolean(),
      desktopNotificationDelivered: z.boolean(),
      desktopStdoutActive: z.boolean(),
    })
    .partial(),
})

const openchamberPageWaitingSchema = z.object({
  type: z.literal("openchamber:page-waiting"),
  properties: z.object({
    sessionID: z.string().min(1),
    directory: z.string().min(1).nullable().catch(null),
    page: z.object({ id: z.string().min(1), title: z.string() }),
  }),
})

const openchamberPageSettledSchema = z.object({
  type: z.literal("openchamber:page-settled"),
  properties: z.object({ sessionID: z.string().min(1), pageID: z.string().min(1) }),
})

const openchamberSessionAssistSchema = z.object({
  type: z.literal("openchamber:session-assist"),
  properties: z.object({
    sessionID: z.string().min(1),
    directory: z.string().min(1).nullable().catch(null),
    pending: z.boolean(),
  }),
})

const openchamberWorkflowRunSchema = z.object({
  type: z.literal("openchamber:workflow-run"),
  properties: z.object({ run: workflowRunSchema }),
})

const openchamberWorkflowRunRemovedSchema = z.object({
  type: z.literal("openchamber:workflow-run-removed"),
  properties: z.object({ runId: z.string().min(1), parentSessionId: z.string().min(1) }),
})

const openchamberSpaceStreamSchema = z.object({
  type: z.literal("openchamber:space-stream"),
  properties: z.object({
    spaceId: z.string().regex(/^[0-9a-f]{12}$/),
    status: z.enum(["connected", "disconnected"]),
    wasReady: z.boolean(),
  }),
})

const openchamberSpaceProgressSchema = z.object({
  type: z.literal("openchamber:space-progress"),
  properties: z.object({
    spaceId: z.string().regex(/^[0-9a-f]{12}$/),
    step: z.union([spaceCreationStepSchema, z.literal("failed"), z.literal("removed")]),
    failure: z.object({ code: z.string(), message: z.string() }).nullable(),
  }),
})

const openchamberSpaceTaskTitleSchema = z.object({
  type: z.literal("openchamber:space-task-title.updated"),
  properties: z.object({ spaceId: z.string().regex(/^[0-9a-f]{12}$/), taskTitle: spaceTaskTitleSchema.nullable() }),
})


const openchamberSpaceSetupSchema = z.object({
  type: z.literal("openchamber:space-setup"),
  properties: z.object({ spaceId: z.string().regex(/^[0-9a-f]{12}$/) }),
})

const openchamberAutoAcceptSchema = z.object({
  type: z.literal("openchamber:permission-auto-accept.updated"),
  properties: z.object({
    sessions: z.record(z.string(), z.boolean()),
    modes: z.record(z.string(), z.enum(["ask", "safety", "auto"])).optional(),
    revision: z.number().optional(),
    spaceId: z.string().regex(/^[0-9a-f]{12}$/).optional(),
  }),
})

const openchamberSpacePermissionStreamSchema = z.object({
  type: z.literal("openchamber:space-permission-stream"),
  properties: z.object({ spaceId: z.string().regex(/^[0-9a-f]{12}$/), status: z.literal("connected") }),
})

const openchamberLeftForUserSchema = z.object({
  type: z.literal("openchamber:permission-auto-accept.left-for-user"),
  properties: z.object({
    permissionId: z.string().min(1),
    sessionId: z.string().min(1),
    directory: z.string().nullable(),
    spaceId: z.string().regex(/^[0-9a-f]{12}$/).optional(),
  }),
})

const payloadTypeSchema = z.object({ type: z.string() })

const OPENCHAMBER_TYPE_PREFIX = "openchamber:"

function translateOpenchamberStatus(payload: unknown): SyncEvent | null {
  const parsed = openchamberStatusSchema.safeParse(payload)
  if (!parsed.success) return null
  const { sessionID, sessionId, status, metadata, timestamp, turnStartedAt } = parsed.data.properties
  const id = sessionID ?? sessionId
  if (!id) return null
  const turnStart = status !== "idle" && timestamp !== undefined && turnStartedAt !== undefined
    ? { turnStart: hostTurnStart(turnStartedAt, timestamp) }
    : {}
  if (status === "retry") {
    if (metadata?.attempt === undefined || metadata.message === undefined || metadata.next === undefined) return null
    return {
      type: "session.status",
      properties: { sessionID: id, status: { type: "retry", attempt: metadata.attempt, message: metadata.message, next: metadata.next }, ...turnStart },
    }
  }
  return { type: "session.status", properties: { sessionID: id, status: { type: status }, ...turnStart } }
}

function translateOpenchamberEvent(type: string, payload: unknown): SyncEvent | null {
  switch (type) {
    case "openchamber:session-status":
      return translateOpenchamberStatus(payload)
    case "openchamber:session-archived": {
      const parsed = openchamberArchivedSchema.safeParse(payload)
      if (!parsed.success) return null
      const { sessionID, archivedAt } = parsed.data.properties
      return { type: "session.patched", properties: { sessionID, patch: { time: { archived: archivedAt } } } }
    }
    case "openchamber:session-metadata": {
      const parsed = openchamberMetadataSchema.safeParse(payload)
      if (!parsed.success) return null
      const { sessionID } = parsed.data.properties
      // SAFETY: the server serialises this object from JSON, so every value is a JsonValue.
      const value = parsed.data.properties.metadata as Metadata
      return { type: "session.patched", properties: { sessionID, patch: { metadata: value } } }
    }
    case "openchamber:notification": {
      const parsed = openchamberNotificationSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.notification", properties: parsed.data.properties } : null
    }
    case "openchamber:permission-auto-accept.updated": {
      const parsed = openchamberAutoAcceptSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.permission-auto-accept", properties: parsed.data.properties } : null
    }
    case "openchamber:page-waiting": {
      const parsed = openchamberPageWaitingSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.page-waiting", properties: parsed.data.properties } : null
    }
    case "openchamber:page-settled": {
      const parsed = openchamberPageSettledSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.page-settled", properties: parsed.data.properties } : null
    }
    case "openchamber:session-assist": {
      const parsed = openchamberSessionAssistSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.session-assist", properties: parsed.data.properties } : null
    }
    case "openchamber:permission-auto-accept.left-for-user": {
      const parsed = openchamberLeftForUserSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.permission-left-for-user", properties: parsed.data.properties } : null
    }
    case "openchamber:workflow-run": {
      const parsed = openchamberWorkflowRunSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.workflow-run", properties: parsed.data.properties } : null
    }
    case "openchamber:workflow-run-removed": {
      const parsed = openchamberWorkflowRunRemovedSchema.safeParse(payload)
      return parsed.success ? { type: "openchamber.workflow-run-removed", properties: parsed.data.properties } : null
    }
    default:
      return null
  }
}

function translateWirePayload(payload: unknown, frameDirectory: string | undefined, isStale?: StaleWireEventCheck): Array<{ directory: string; event: SyncEvent }> {
  if (!wireEventSchema.safeParse(payload).success) return []
  // SAFETY: the discriminator and location were validated above; the rest of
  // the shape is the server's generated contract, narrowed per `type` by the
  // translator.
  const event = payload as OpenCodeEvent
  if (isStale?.(event)) return []
  const routed = routeWireEvent(event)
  if (!frameDirectory) return routed
  return routed.map((entry) => (entry.directory === GLOBAL_EVENT_DIRECTORY ? { ...entry, directory: frameDirectory } : entry))
}

type ClassifiedStreamPayload =
  | { kind: "space-stream"; properties: z.infer<typeof openchamberSpaceStreamSchema>["properties"] }
  | { kind: "space-progress"; properties: SpaceProgress }
  | { kind: "space-task-title"; properties: z.infer<typeof openchamberSpaceTaskTitleSchema>["properties"] }
  | { kind: "space-setup"; spaceId: string }
  | { kind: "space-permission-stream"; spaceId: string }
  | { kind: "events"; events: Array<{ directory: string; event: SyncEvent }> }

const NO_EVENTS: ClassifiedStreamPayload = { kind: "events", events: [] }

export function classifyStreamPayload(payload: unknown, frameDirectory: string | undefined, isStale?: StaleWireEventCheck): ClassifiedStreamPayload {
  const typed = payloadTypeSchema.safeParse(payload)
  if (!typed.success) return NO_EVENTS
  const { type } = typed.data
  if (!type.startsWith(OPENCHAMBER_TYPE_PREFIX)) return { kind: "events", events: translateWirePayload(payload, frameDirectory, isStale) }

  switch (type) {
    case "openchamber:space-stream": {
      const parsed = openchamberSpaceStreamSchema.safeParse(payload)
      return parsed.success ? { kind: "space-stream", properties: parsed.data.properties } : NO_EVENTS
    }
    case "openchamber:space-progress": {
      const parsed = openchamberSpaceProgressSchema.safeParse(payload)
      return parsed.success ? { kind: "space-progress", properties: parsed.data.properties } : NO_EVENTS
    }
    case "openchamber:space-task-title.updated": {
      const parsed = openchamberSpaceTaskTitleSchema.safeParse(payload)
      return parsed.success ? { kind: "space-task-title", properties: parsed.data.properties } : NO_EVENTS
    }
    case "openchamber:space-setup": {
      const parsed = openchamberSpaceSetupSchema.safeParse(payload)
      return parsed.success ? { kind: "space-setup", spaceId: parsed.data.properties.spaceId } : NO_EVENTS
    }
    case "openchamber:space-permission-stream": {
      const parsed = openchamberSpacePermissionStreamSchema.safeParse(payload)
      return parsed.success ? { kind: "space-permission-stream", spaceId: parsed.data.properties.spaceId } : NO_EVENTS
    }
  }
  const bridged = translateOpenchamberEvent(type, payload)
  if (bridged) return { kind: "events", events: [{ directory: frameDirectory ?? GLOBAL_EVENT_DIRECTORY, event: bridged }] }
  return { kind: "events", events: translateWirePayload(payload, frameDirectory, isStale) }
}

