import type { PermissionMode } from "@/stores/utils/permissionAutoAccept"
import type { SyntheticContextPart } from "./input-store"

export type NewSessionDraftTarget = "chat" | "project"

export type NewSessionDraftState = {
  draftId: number
  open: boolean
  selectedProjectId?: string | null
  directoryOverride: string | null
  permissionMode?: PermissionMode
  pendingWorktreeRequestId?: string | null
  bootstrapPendingDirectory?: string | null
  worktreeStartDirectory?: { worktreeRoot: string; directory: string | null } | null
  preserveDirectoryOverride?: boolean
  parentID: string | null
  title?: string
  initialPrompt?: string
  syntheticParts?: SyntheticContextPart[]
  targetFolderId?: string
  projectContextPins?: { notes: string[]; plans: string[] }
  target: NewSessionDraftTarget
  preparedChatDirectory?: string | null
  workDraftId?: string
  lead?: boolean
  backendID?: string
}

