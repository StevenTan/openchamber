import type { ConversationClient } from "./client"
import type { AgentEventSource } from "./event-source"
import type { AgentRuntime } from "./runtime"

export interface AgentBackend {
  id: string
  client: ConversationClient
  events: AgentEventSource
  runtime: AgentRuntime
}
