import type { ConversationClient } from "./client"
import type { AgentEventSource } from "./event-source"

export interface AgentBackend {
  client: ConversationClient
  events: AgentEventSource
}
