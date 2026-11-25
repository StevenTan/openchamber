import type { AgentBackend } from './backend'

export function createApplicationBackend(opencode: AgentBackend, antigravity: AgentBackend): AgentBackend {
  return {
    id: 'application',
    client: {
      createSession: (...args) => opencode.client.createSession(...args),
      getSession: (...args) => opencode.client.getSession(...args),
      getSessionUnscoped: (...args) => opencode.client.getSessionUnscoped(...args),
      captureSessionCleanup: (...args) => opencode.client.captureSessionCleanup(...args),
      deleteSession: (...args) => opencode.client.deleteSession(...args),
      renameSession: (...args) => opencode.client.renameSession(...args),
      getSessionMessages: (...args) => opencode.client.getSessionMessages(...args),
      getSessionMessage: (...args) => opencode.client.getSessionMessage(...args),
      getToolContentMessage: (...args) => opencode.client.getToolContentMessage(...args),
      getSessionInbox: (...args) => opencode.client.getSessionInbox(...args),
      switchSessionModel: (...args) => opencode.client.switchSessionModel(...args),
      switchSessionAgent: (...args) => opencode.client.switchSessionAgent(...args),
      applySendSelection: (...args) => opencode.client.applySendSelection(...args),
      sendMessage: (...args) => opencode.client.sendMessage(...args),
      abortSession: (...args) => opencode.client.abortSession(...args),
      getProvidersForConfig: (...args) => opencode.client.getProvidersForConfig(...args),
      listAgents: (...args) => opencode.client.listAgents(...args),
      replyToPermission: (...args) => opencode.client.replyToPermission(...args),
      replyToForm: (...args) => opencode.client.replyToForm(...args),
      cancelForm: (...args) => opencode.client.cancelForm(...args),
      async listSessionsPage(options) {
        const [page, native] = await Promise.all([
          opencode.client.listSessionsPage(options),
          options?.cursor ? Promise.resolve([]) : antigravity.client.listSessions(options?.directory),
        ])
        return { ...page, sessions: [...page.sessions, ...native.filter(session =>
          !options?.parentID && (!options?.search || session.title.includes(options.search)),
        )] }
      },
      async listSessions(directory) {
        return (await Promise.all([opencode.client.listSessions(directory), antigravity.client.listSessions(directory)])).flat()
      },
    },
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
