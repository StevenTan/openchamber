import { createOpenCodeBackend } from './opencode/backend'
import { registerAgentBackend } from './agent/registry'
import { createAntigravityAdapter } from './agent/antigravity'
import { createApplicationBackend } from './agent/application'
import { isVSCodeRuntime } from './desktop'

registerAgentBackend('opencode', () => createOpenCodeBackend())
const antigravity = createAntigravityAdapter()
registerAgentBackend('antigravity', () => antigravity)
registerAgentBackend('application', () => {
  const opencode = createOpenCodeBackend()
  return isVSCodeRuntime() ? opencode : createApplicationBackend(opencode, antigravity)
})
