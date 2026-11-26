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
    },
    events: opencode.events,
  }
}
