import { conversationClient } from '@/lib/agent/active'
import type { Session } from '@/lib/agent/model'
import { isVSCodeRuntime } from '@/lib/desktop'
import { getSessionMetadata } from '@/lib/sessionReviewMetadata'
import { applyForkInheritance, type ForkInheritanceDeps } from '@/lib/sessionForkInheritance'

type ForkOptions = ForkInheritanceDeps & { sourceDirectory: string | undefined }

export async function inheritForkSession(sourceID: string, fork: Session, options: ForkOptions) {
  if (!isVSCodeRuntime()) {
    const source = await conversationClient.getSession(sourceID, options.sourceDirectory)
    if (source.metadata) {
      await options.patchMetadata(fork.id, () => getSessionMetadata(source))
      fork = { ...fork, metadata: source.metadata }
    }
  }
  if (isVSCodeRuntime()) {
    try {
      const { usePermissionStore } = await import('@/stores/permissionStore')
      if (!options.isCurrent()) return
      await usePermissionStore.getState().hydrate()
      if (!options.isCurrent()) return
      const permissions = usePermissionStore.getState()
      if (!Object.hasOwn(permissions.modes, fork.id)) {
        await permissions.setSessionMode(fork.id, permissions.getSessionMode(sourceID))
      }
    } catch (error) {
      console.warn('[fork] failed to copy the permission mode to the fork', error)
    }
    if (!options.isCurrent()) return
  }
  return applyForkInheritance(sourceID, fork, options)
}
