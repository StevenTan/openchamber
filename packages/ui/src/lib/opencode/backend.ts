import type { OpenCodeClient } from "@opencode/client"
import type { AgentBackend } from "../agent/backend"
import { opencodeClient } from "./client"
import { createOpenCodeEventSource } from "./event-source"
import { openCodeRuntime } from './runtime'

export const createOpenCodeBackend = (sdk?: OpenCodeClient): AgentBackend => ({
  id: 'opencode',
  client: opencodeClient,
  events: {
    get identity() { return sdk ?? opencodeClient.getSdkClient() },
    connect: (input) => createOpenCodeEventSource(sdk ?? opencodeClient.getSdkClient()).connect(input),
  },
  runtime: openCodeRuntime,
})
