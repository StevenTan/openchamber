
import type {
  CommandInfo,
  ConfigEntry,
  ConnectionInfo,
  IntegrationExternalMethod as IntegrationExternalMethodWire,
  IntegrationInfo,
  IntegrationKeyMethod as IntegrationKeyMethodWire,
  IntegrationOAuthMethod as IntegrationOAuthMethodWire,
  McpServer,
  ModelInfo,
  SkillInfo,
} from "@opencode/client"


import type { ModelRef, ModelSelection, Message, UserMessage, AssistantMessage } from "../agent/model"
export type { JsonValue, Metadata, ModelRef, ModelSelection, TokenUsageInfo, PermissionRuleset, SessionStatus, SessionOutcome, Session, StructuredError, UserMessage, AssistantFinish, AssistantMessage, SyntheticMessage, CompactionMessage, Message, TextPart, ReasoningPart, FilePart, ToolInput, ToolStateCompleted, ToolState, ToolPart, Part, PartType } from "../agent/model"

type MessageRole = Message["role"]


export type Command = CommandInfo
export type Skill = SkillInfo

export type Integration = IntegrationInfo
export type IntegrationConnection = ConnectionInfo
export type IntegrationExternalMethod = IntegrationExternalMethodWire
export type IntegrationKeyMethod = IntegrationKeyMethodWire
export type IntegrationOAuthMethod = IntegrationOAuthMethodWire




export type McpServerStatus = McpServer
export type ConfigDocument = Extract<ConfigEntry, { type: "document" }>
export type Config = ConfigDocument["info"]
export type OpenCodeModel = ModelInfo


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


export { compact } from '@openchamber/sdk/conversations/identities'




export type PermissionReply = "once" | "always" | "reject"




export { partIds } from '@openchamber/sdk/conversations/identities'

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

export type { Agent, Model, Provider } from "../agent/catalog"
export type { FormField, FormValue, FormWhen, FormRequest, PermissionRequest, PermissionEffect } from "../agent/requests"
export type { Project, Vcs } from "../agent/model"
