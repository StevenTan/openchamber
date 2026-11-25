export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type Metadata = Record<string, JsonValue>
export type ModelRef = { id: string; providerID: string; variant?: string }
export type ModelSelection = Omit<ModelRef, "variant"> & { variant?: string | null }
export type TokenUsageInfo = { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
export type PermissionRuleset = Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }>
export type SessionStatus = { type: "idle" } | { type: "busy" } | {
  type: "retry"; attempt: number; message: string; next: number
  action?: { reason: string; provider: string; title: string; message: string; label: string; link?: string }
}
type SessionForkBoundary = { type: "before" | "through"; messageID: string }
type SessionRevert = {
  messageID: string; partID?: string; snapshot?: string
  files?: Array<{ file: string; patch: string; additions: number; deletions: number; status: "added" | "deleted" | "modified"; more?: true }>
}

export type SessionOutcome = "succeeded" | "failed" | "interrupted"

export type Session = {
  id: string
  backendID?: string
  parentID?: string
  projectID: string
  directory: string
  subpath?: string
  title: string
  agent?: string
  model?: ModelRef
  cost: number
  tokens: TokenUsageInfo
  outcome?: SessionOutcome
  time: {
    created: number
    updated: number
    idle?: number
    viewed?: number
    archived?: number
  }
  metadata?: Metadata
  permissions?: PermissionRuleset
  revert?: SessionRevert
  fork?: {
    sessionID: string
    boundary: SessionForkBoundary
  }
}

export type Project = {
  id: string
  worktree: string
  vcs?: string
  name?: string
  icon?: { url?: string; override?: string; color?: string }
  commands?: { start?: string }
  time: { created: number; updated: number }
  sandboxes: string[]
}
export type Vcs = { branch?: string; defaultBranch?: string }
export type RunningShell = { id: string; sessionID: string; command: string; file: string; startedAt: number }
export type ShellEnd = { kind: 'exited'; status: 'exited' | 'timeout' | 'killed'; exit?: number } | { kind: 'removed' }
export type RunningImageJob = { id: string; sessionID: string; path: string; model: string; startedAt: number }


export type StructuredError = { type: string; message: string; status?: number; response?: { body: string }; retryAfterMs?: number }

type MessageBase = {
  id: string
  sessionID: string
  metadata?: Metadata
}

export type UserMessage = MessageBase & {
  role: "user"
  time: { created: number }
  skills?: Array<{ id: string; name: string }>
}

export type AssistantFinish = "stop" | "length" | "tool-calls" | "content-filter" | "error" | "unknown"

export type AssistantMessage = MessageBase & {
  role: "assistant"
  time: {
    created: number
    firstToken?: number
    streamed?: number
    completed?: number
  }
  agent: string
  providerID: string
  modelID: string
  variant?: string
  finish?: AssistantFinish
  error?: StructuredError
  closedLocally?: true
  cost?: number
  tokens?: TokenUsageInfo
  snapshot?: { start?: string; end?: string; files?: string[] }
  retry?: { attempt: number; at: number; error: StructuredError }
  context?: { used: number; limit: number }
}

export type SyntheticMessage = MessageBase & {
  role: "synthetic"
  time: { created: number }
  text: string
  description?: string
  pending?: true
}

type SystemMessage = MessageBase & {
  role: "system"
  time: { created: number }
  text: string
  description?: string
}

type SkillMessage = MessageBase & {
  role: "skill"
  time: { created: number }
  skill: string
  name: string
  text: string
}

type ShellMessage = MessageBase & {
  role: "shell"
  time: { created: number; completed?: number }
  shellID: string
  command: string
  status: "running" | "exited" | "timeout" | "killed"
  exit?: number
  signal?: string
  output?: { output: string; cursor: number; size: number; truncated: boolean }
}

export type CompactionMessage = MessageBase & {
  role: "compaction"
  time: { created: number }
  status: "running" | "completed" | "failed"
  reason: "auto" | "manual"
  summary: string
  model?: ModelRef
  error?: StructuredError
  cost?: number
  tokens?: TokenUsageInfo
}

type AgentSwitchedMessage = MessageBase & {
  role: "agent-switched"
  time: { created: number }
  agent: string
  previous?: string
}

type ModelSwitchedMessage = MessageBase & {
  role: "model-switched"
  time: { created: number }
  model: ModelRef
  previous?: ModelRef
}

type LocationSwitchedMessage = MessageBase & {
  role: "location-switched"
  time: { created: number }
  directory: string
  previous?: string
}

type IdleMessage = MessageBase & {
  role: "idle"
  time: { created: number }
  outcome: SessionOutcome
  error?: StructuredError
}

export type Message =
  | UserMessage
  | AssistantMessage
  | SyntheticMessage
  | SystemMessage
  | SkillMessage
  | ShellMessage
  | CompactionMessage
  | AgentSwitchedMessage
  | ModelSwitchedMessage
  | LocationSwitchedMessage
  | IdleMessage



type PartBase = {
  id: string
  sessionID: string
  messageID: string
}

export type TextPart = PartBase & {
  type: "text"
  text: string
  time?: { start: number; end?: number }
  metadata?: Metadata
}

export type ReasoningPart = PartBase & {
  type: "reasoning"
  text: string
  time: { start: number; end?: number }
}

export type FilePart = PartBase & {
  type: "file"
  mime: string
  filename?: string
  url: string
}

type AgentPart = PartBase & {
  type: "agent"
  name: string
}

export type ToolInput = Record<string, JsonValue>

type ToolStatePending = {
  status: "pending"
  input: ToolInput
  raw: string
}

type ToolStateRunning = {
  status: "running"
  input: ToolInput
  metadata?: Metadata
  time: { start: number }
}

export type ToolStateCompleted = {
  status: "completed"
  input: ToolInput
  output: string
  metadata?: Metadata
  time: { start: number; end: number }
  attachments?: FilePart[]
}

type ToolStateError = {
  status: "error"
  input: ToolInput
  error: string
  errorType?: string
  errorSource?: "local"
  output?: string
  metadata?: Metadata
  time: { start: number; end: number }
}

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError

export type ToolPart = PartBase & {
  type: "tool"
  callID: string
  tool: string
  state: ToolState
  executed?: boolean
}

export type Part = TextPart | ReasoningPart | FilePart | AgentPart | ToolPart

export type PartType = Part["type"]


