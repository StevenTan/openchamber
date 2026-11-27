import '../agentBackends'
import type { ConversationClient } from "./client"
import { getAgentBackend, getSessionBackend, rememberSessionBackend } from './registry'

export { getAgentBackend, getSessionBackend } from './registry'

export const conversationClient: ConversationClient = {
  async listSessionsPage(options) {
    const page = await getAgentBackend().client.listSessionsPage(options)
    page.sessions.forEach(rememberSessionBackend)
    return page
  },
  async listSessions(directory) {
    const sessions = await getAgentBackend().client.listSessions(directory)
    sessions.forEach(rememberSessionBackend)
    return sessions
  },
  async createSession(params, directory) {
    const session = await getAgentBackend(params?.backendID ?? 'opencode').client.createSession(params, directory)
    rememberSessionBackend(session)
    return session
  },
  async getSession(id, directory, signal) {
    const session = await getSessionBackend(id).client.getSession(id, directory, signal)
    rememberSessionBackend(session)
    return session
  },
  async getSessionUnscoped(id) {
    const session = await getSessionBackend(id).client.getSessionUnscoped(id)
    rememberSessionBackend(session)
    return session
  },
  captureSessionCleanup: (directory, runtimeKey, backendID) => getAgentBackend(backendID ?? 'opencode').client.captureSessionCleanup(directory, runtimeKey),
  deleteSession: (id, directory) => getSessionBackend(id).client.deleteSession(id, directory),
  renameSession: (id, title, directory) => getSessionBackend(id).client.renameSession(id, title, directory),
  getSessionMessages: (id, options, directory) => getSessionBackend(id).client.getSessionMessages(id, options, directory),
  getSessionMessage: (id, messageID, directory) => getSessionBackend(id).client.getSessionMessage(id, messageID, directory),
  getToolContentMessage: (id, messageID, directory) => getSessionBackend(id).client.getToolContentMessage(id, messageID, directory),
  getSessionInbox: (id, directory) => getSessionBackend(id).client.getSessionInbox(id, directory),
  switchSessionModel: (id, model, directory) => getSessionBackend(id).client.switchSessionModel(id, model, directory),
  switchSessionAgent: (id, agent, directory) => getSessionBackend(id).client.switchSessionAgent(id, agent, directory),
  applySendSelection: (id, selection, directory, runtimeKey) => getSessionBackend(id).client.applySendSelection(id, selection, directory, runtimeKey),
  sendMessage: (input) => getSessionBackend(input.id).client.sendMessage(input),
  abortSession: (id, directory) => getSessionBackend(id).client.abortSession(id, directory),
  getProvidersForConfig: (directory, options) => getAgentBackend().client.getProvidersForConfig(directory, options),
  listAgents: (directory) => getAgentBackend().client.listAgents(directory),
  replyToPermission: (id, requestID, reply, options) => getSessionBackend(id).client.replyToPermission(id, requestID, reply, options),
  replyToForm: (id, formID, answer, directory) => getSessionBackend(id).client.replyToForm(id, formID, answer, directory),
  cancelForm: (id, formID, directory, message) => getSessionBackend(id).client.cancelForm(id, formID, directory, message),
  stageRevert: (id, messageID, options) => getSessionBackend(id).client.stageRevert(id, messageID, options),
  clearRevert: (id, directory) => getSessionBackend(id).client.clearRevert(id, directory),
  commitRevert: (id, directory) => getSessionBackend(id).client.commitRevert(id, directory),
  async forkSession(id, options) {
    const session = await getSessionBackend(id).client.forkSession(id, options)
    rememberSessionBackend(session)
    return session
  },
}
