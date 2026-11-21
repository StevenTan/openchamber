import type { OpenCodeClient } from "@opencode/client"
import type { AgentBackend } from "../agent/backend"
import { opencodeClient } from "./client"
import { createOpenCodeEventSource } from "./event-source"

export const createOpenCodeBackend = (sdk: OpenCodeClient): AgentBackend => ({
  client: opencodeClient,
  events: createOpenCodeEventSource(sdk),
})
