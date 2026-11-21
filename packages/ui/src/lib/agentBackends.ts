import { createOpenCodeBackend } from './opencode/backend'
import { registerAgentBackend, selectAgentBackend } from './agent/registry'

registerAgentBackend('opencode', () => createOpenCodeBackend())
selectAgentBackend('opencode')
