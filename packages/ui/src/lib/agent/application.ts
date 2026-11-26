import type { AgentBackend } from './backend'

export function createApplicationBackend(opencode: AgentBackend, antigravity: AgentBackend): AgentBackend {
  return {
    id: 'application',
    client: opencode.client,
    runtime: {
      ...opencode.runtime,
      setDirectory(directory) { opencode.runtime.setDirectory(directory); antigravity.runtime.setDirectory(directory) },
      reconnectToRuntimeBaseUrl() { opencode.runtime.reconnectToRuntimeBaseUrl(); antigravity.runtime.reconnectToRuntimeBaseUrl() },
      async getActiveSessionStatuses(directory) {
        const [standard, native] = await Promise.all([opencode.runtime.getActiveSessionStatuses(directory), antigravity.runtime.getActiveSessionStatuses(directory)])
        return standard === null ? null : { ...standard, ...native }
      },
      async listPendingForms(options) {
        return (await Promise.all([opencode.runtime.listPendingForms(options), antigravity.runtime.listPendingForms(options)])).flat()
      },
      async listPendingPermissions(options) {
        return (await Promise.all([opencode.runtime.listPendingPermissions(options), antigravity.runtime.listPendingPermissions(options)])).flat()
      },
    },
    events: {
      get identity() { return opencode.events.identity },
      connect(input) {
        const standard = opencode.events.connect(input)
        const native = antigravity.events.connect(input)
        return {
          cleanup() { standard.cleanup(); native.cleanup() },
          reconnect(reason) { standard.reconnect(reason); native.reconnect(reason) },
        }
      },
    },
  }
}
