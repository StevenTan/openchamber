import type { JsonValue, ModelRef, PermissionRuleset } from './model.js'

type ModelCompatibility = {
  reasoningField?: string
  requireReasoning?: boolean
  maxTokensField?: 'max_completion_tokens' | 'max_tokens'
  requireFinishReason?: boolean
  requireAssistantAfterTool?: boolean
  supportsPromptCacheKey?: boolean
  streamUsage?: boolean
  cacheFormat?: 'anthropic' | 'alibaba'
  supportsThinkingBlockBinding?: boolean
  supportsEffortUpdates?: boolean
  mediaInput?: 'assets' | 'state' | 'root'
}

export type Provider = {
  id: string
  canonical?: string
  integrationID?: string
  name: string
  activation: 'auto' | 'enabled' | 'disabled'
  package: string
  compatibility?: ModelCompatibility
  settings?: Record<string, JsonValue>
  headers?: Record<string, string>
  body?: Record<string, JsonValue>
}

export type Model = {
  id: string
  modelID: string
  providerID: string
  canonical?: string
  type?: string
  family?: string
  name: string
  compatibility?: ModelCompatibility
  package?: string
  settings?: Record<string, JsonValue>
  headers?: Record<string, string>
  body?: Record<string, JsonValue>
  capabilities: { tools: boolean; freeform?: Array<'text' | 'regex' | 'lark'>; input: string[]; output: string[]; temperature?: boolean }
  variants: Array<{ id: string; settings?: Record<string, JsonValue>; headers?: Record<string, string>; body?: Record<string, JsonValue> }>
  time: { released: number }
  cost: Array<{ tier?: { type: 'context'; size: number }; input: number; output: number; cache: { read: number; write: number } }>
  status: 'alpha' | 'beta' | 'deprecated' | 'active'
  enabled: boolean
  limit: { context: number; input?: number; output: number }
}

export type Agent = {
  id: string
  name: string
  displayName: string
  model?: ModelRef
  request: { settings: Record<string, JsonValue>; headers: Record<string, string>; body: Record<string, JsonValue> }
  system?: string
  description?: string
  mode: 'subagent' | 'primary' | 'all'
  hidden: boolean
  color?: string
  steps?: number
  permissions: PermissionRuleset
}
