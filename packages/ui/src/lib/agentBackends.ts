import { createOpenCodeBackend } from './opencode/backend'
import { registerAgentBackend } from './agent/registry'
import { createAntigravityAdapter } from './agent/antigravity'
import { createApplicationBackend } from './agent/application'
import { isVSCodeRuntime } from './desktop'
import { createConversationHttpClient } from './agent/http-client'

const standard = createOpenCodeBackend()
const antigravity = createAntigravityAdapter()
const opencode = { ...standard, client: createConversationHttpClient('opencode', standard.runtime, standard.client) }
registerAgentBackend('opencode', () => isVSCodeRuntime() ? standard : opencode)
registerAgentBackend('antigravity', () => antigravity)
registerAgentBackend('application', () => isVSCodeRuntime() ? standard : { ...createApplicationBackend(opencode, antigravity), client: opencode.client })
