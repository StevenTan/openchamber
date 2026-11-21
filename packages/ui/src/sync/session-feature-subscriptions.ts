import { subscribeSessionAdmission } from "./session-admission"
import { subscribeMessageQueueSync } from "./message-queue-sync"
import { subscribeAutoReviewSync } from "./auto-review-sync"
import { subscribePrWatchSync } from "./pr-watch-sync"
import { subscribeExtensionWaitsSync } from "./extension-waits-sync"
import { subscribeLaterPagesSync } from "./later-pages-sync"
import { subscribeSessionWarmingSync } from "./session-warming-sync"
import { subscribeSessionTodosSync } from "./session-todos-sync"
import { subscribeSessionFoldersSync } from "./session-folders-sync"
import { subscribeSessionDraftsSync } from "./session-drafts-sync"
import { subscribePermissionPolicySync, subscribeSpacePermissionModes } from "./permission-mode-sync"
import { subscribeControlStreamSync } from "./control-stream-sync"
import { subscribeSpaceCatalogs } from "./space-catalog-sync"
import { subscribeSpaceSessionProject } from "./space-session-project"
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents'
import { projectBackendEvent } from '@/lib/agent-backends/model'
import { applyControlStreamOnlyEvent } from "./sync-control-events"
import type { ChildStoreManager } from "./child-store"
import type { EventRoutingIndex } from "./event-routing-index"
import { handleEvent } from "./sync-event-dispatch"

export function subscribeSessionFeatures(runtimeKey: string, childStores: ChildStoreManager, routingIndex: EventRoutingIndex): () => void {
  const unsubscribeAgentBackends = subscribeOpenchamberEvents(event => {
    if (event.type !== 'agent-backend') return;
    for (const payload of projectBackendEvent(event.event)) handleEvent(event.directory, payload, childStores, routingIndex, runtimeKey);
  });
  const unsubscribeQueueEvents = subscribeMessageQueueSync(runtimeKey)
  const unsubscribeSessionAdmission = subscribeSessionAdmission()
  const unsubscribeAutoReviewEvents = subscribeAutoReviewSync(runtimeKey)
  const unsubscribePrWatchEvents = subscribePrWatchSync(runtimeKey)
  const unsubscribeExtensionWaitEvents = subscribeExtensionWaitsSync(runtimeKey)
  const unsubscribeLaterPageEvents = subscribeLaterPagesSync(runtimeKey)
  const unsubscribeSessionWarming = subscribeSessionWarmingSync(runtimeKey)
  const unsubscribeSessionTodos = subscribeSessionTodosSync(runtimeKey)
  const unsubscribeFolderEvents = subscribeSessionFoldersSync(runtimeKey)
  const unsubscribeDraftEvents = subscribeSessionDraftsSync(runtimeKey)
  const unsubscribeSpaceModes = subscribeSpacePermissionModes(runtimeKey)
  const unsubscribePermissionPolicy = subscribePermissionPolicySync(
    runtimeKey,
    (event) => handleEvent("global", event, childStores, routingIndex, runtimeKey),
  )
  const unsubscribeControlStream = subscribeControlStreamSync(runtimeKey, (event) => {
    if (event.type === "session.patched") handleEvent("global", event, childStores, routingIndex, runtimeKey)
    else applyControlStreamOnlyEvent(event)
  })
  const unsubscribeSpaceCatalogs = subscribeSpaceCatalogs(runtimeKey)
  const unsubscribeSpaceSessionProject = subscribeSpaceSessionProject(runtimeKey)
  return () => {
    unsubscribeAgentBackends()
    unsubscribeQueueEvents()
    unsubscribeSessionAdmission()
    unsubscribeAutoReviewEvents()
    unsubscribePrWatchEvents()
    unsubscribeExtensionWaitEvents()
    unsubscribeLaterPageEvents()
    unsubscribeSessionWarming()
    unsubscribeSessionTodos()
    unsubscribeFolderEvents()
    unsubscribeDraftEvents()
    unsubscribeSpaceModes()
    unsubscribePermissionPolicy()
    unsubscribeControlStream()
    unsubscribeSpaceCatalogs()
    unsubscribeSpaceSessionProject()
  }
}
