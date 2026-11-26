import { createOpenCodeBackend } from './opencode/backend'
import { registerAgentBackend } from './agent/registry'
import { createAntigravityAdapter } from './agent/antigravity'
import { createApplicationBackend } from './agent/application'
import { isVSCodeRuntime } from './desktop'
import { createConversationHttpClient } from './agent/http-client'
import { createConversationEventSource } from './agent/http-events'

const standard = createOpenCodeBackend()
const events = createConversationEventSource()
const antigravity = createAntigravityAdapter(events)
const opencode = { ...standard, events, client: createConversationHttpClient('opencode', standard.runtime, standard.client) }
registerAgentBackend('opencode', () => isVSCodeRuntime() ? standard : opencode)
registerAgentBackend('antigravity', () => antigravity)
registerAgentBackend('application', () => isVSCodeRuntime() ? standard : { ...createApplicationBackend(opencode, antigravity), client: opencode.client })
