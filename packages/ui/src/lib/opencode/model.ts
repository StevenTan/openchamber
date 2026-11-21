
import type {
  AgentInfo,
  CommandInfo,
  ConfigEntry,
  ConnectionInfo,
  FormField as FormFieldWire,
  FormInfo,
  FormValue as FormValueWire,
  FormWhen as FormWhenWire,
  IntegrationExternalMethod as IntegrationExternalMethodWire,
  IntegrationInfo,
  IntegrationKeyMethod as IntegrationKeyMethodWire,
  IntegrationOAuthMethod as IntegrationOAuthMethodWire,
  McpServer,
  ModelInfo,
  PermissionRequest as PermissionRequestWire,
  PermissionEffect as PermissionEffectWire,
  ProviderInfo,
  SkillInfo,
} from "@opencode/client"


import type { ModelRef, ModelSelection, Message, UserMessage, AssistantMessage } from "../agent/model"
export type { JsonValue, Metadata, ModelRef, ModelSelection, TokenUsageInfo, PermissionRuleset, SessionStatus, SessionOutcome, Session, StructuredError, UserMessage, AssistantFinish, AssistantMessage, SyntheticMessage, CompactionMessage, Message, TextPart, ReasoningPart, FilePart, ToolInput, ToolStateCompleted, ToolState, ToolPart, Part, PartType } from "../agent/model"

type MessageRole = Message["role"]

export type Agent = Omit<AgentInfo, "name"> & { name: string; displayName: string }
export type Command = CommandInfo
export type Skill = SkillInfo
export type Provider = ProviderInfo
export type Integration = IntegrationInfo
export type IntegrationConnection = ConnectionInfo
export type IntegrationExternalMethod = IntegrationExternalMethodWire
export type IntegrationKeyMethod = IntegrationKeyMethodWire
export type IntegrationOAuthMethod = IntegrationOAuthMethodWire
export type FormField = FormFieldWire
export type FormValue = FormValueWire
export type FormWhen = FormWhenWire
export type PermissionEffect = PermissionEffectWire
export type Model = ModelInfo
export type McpServerStatus = McpServer
export type Vcs = { branch?: string; defaultBranch?: string }

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
export type ConfigDocument = Extract<ConfigEntry, { type: "document" }>
export type Config = ConfigDocument["info"]


export function toModelRef({ providerID, id, variant }: ModelSelection): ModelRef {
  return variant ? { providerID, id, variant } : { providerID, id }
}

export function isSameModelRef(current: ModelRef, next: ModelRef): boolean {
  return current.providerID === next.providerID
    && current.id === next.id
    && (current.variant ?? "default") === (next.variant ?? "default")
}

export function findCatalogModel<T extends { id: string; modelID: string }>(
  models: readonly T[] | undefined,
  id: string,
): T | undefined {
  if (!models || !id) return undefined
  return models.find((model) => model.id === id) ?? models.find((model) => model.modelID === id)
}


export function compact<T extends object>(value: T): T {
  // SAFETY: only keys with an undefined value are dropped; every remaining
  // key keeps its declared type, so the result still satisfies T.
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}



export type PermissionRequest = PermissionRequestWire
export type PermissionReply = "once" | "always" | "reject"

export type FormRequest = FormInfo


export const partIds = {
  text: (messageID: string, ordinal: number) => `${messageID}:text:${ordinal}`,
  reasoning: (messageID: string, ordinal: number) => `${messageID}:reasoning:${ordinal}`,
  tool: (callID: string) => callID,
  userText: (messageID: string) => `${messageID}:text:0`,
  userFile: (messageID: string, index: number) => `${messageID}:file:${index}`,
  userAgent: (messageID: string, index: number) => `${messageID}:agent:${index}`,
} as const

export const isFinalToolStatus = (status: string): boolean => status === "completed" || status === "error"

export const hasParts = (message: Message): message is UserMessage | AssistantMessage =>
  message.role === "user" || message.role === "assistant"

export const isConversationRole = (role: MessageRole): role is "user" | "assistant" =>
  role === "user" || role === "assistant"

export const getLastConversationMessage = (
  messages: readonly Message[] | undefined,
): UserMessage | AssistantMessage | undefined => {
  if (!messages) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message && hasParts(message)) return message
  }
  return undefined
}

export const getLastConversationRecord = <T extends { info: Message }>(
  records: readonly T[] | undefined,
): T | undefined => {
  if (!records) return undefined
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]
    if (record?.info && hasParts(record.info)) return record
  }
  return undefined
}

export const isIncompleteAssistantTurn = (message: Message | undefined): boolean =>
  message?.role === "assistant" && message.time.completed === undefined
