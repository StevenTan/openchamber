import { type SyncEvent } from "@/lib/agent/events"
import type { ControlStreamSyncEvent } from "@/lib/openchamberEvents"
import { applyWaitingPageEvent } from "./global-blocking-requests"
import { applySessionAssistEvent } from "./pending-session-assists"
import { resolveCachedSessionDirectory } from "./event-routing-index"
import { notifyWaitingPage } from "./sync-request-notifications"

type ControlStreamOnlyEvent = Exclude<ControlStreamSyncEvent, { type: "session.patched" }>

export const isControlStreamOnlyEvent = (payload: SyncEvent): payload is ControlStreamOnlyEvent => (
  payload.type === "openchamber.page-waiting"
  || payload.type === "openchamber.page-settled"
  || payload.type === "openchamber.session-assist"
)

export const applyControlStreamOnlyEvent = (payload: ControlStreamOnlyEvent): void => {
  switch (payload.type) {
    case "openchamber.page-waiting":
    case "openchamber.page-settled":
      applyWaitingPageEvent(payload, resolveCachedSessionDirectory)
      if (payload.type === "openchamber.page-waiting") notifyWaitingPage(payload)
      return
    case "openchamber.session-assist":
      applySessionAssistEvent(payload.properties, resolveCachedSessionDirectory)
      return
  }
}
