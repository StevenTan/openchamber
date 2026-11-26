import type { ConversationClient, ProviderCatalog } from './client'
import type { ConversationContext, ConversationPrompt, ConversationSkills, CreateConversation } from '@openchamber/sdk/conversations/http'
import type { ModelSelection } from './model'
import type { Agent, Provider } from './catalog'
import type { AgentRuntime } from './runtime'
import { createRuntimeConversationFetch, opencodeClient, OpencodeApiError, AgentUnavailableError, normalizeOpencodeError } from '../opencode/client'
import { sendConversationMessage } from './send-message'
import { captureRuntimeCleanup } from '../runtime-cleanup'
import { captureRuntimeInstance, getRuntimeKey } from '../runtime-switch'
import { normalizePath } from '../pathNormalization'
import { toOpenCodeDirectory } from '../opencode/projection'
import { withZenName } from '../opencode/providerDisplayName'
import { isAutoModel } from '../routing/autoModel'
import { spaceIdOfDirectory } from '../spaces/space-route'
import { getSpaceMark } from '../spaces/spaces-store'
import { isDefiniteTransportFailure, markAmbiguousTransportFailure } from '../relay/transport-error'
import { readMessageThroughAncestors } from '../opencode/message-ownership'
import type { FormRequest, PermissionRequest, FormValue } from './requests'

const root = '/api/conversations'
const catalogRoot = '/api/conversation-catalog'
type ConversationBody = CreateConversation | ModelSelection | ConversationContext | ConversationPrompt | { title: string } | { agent: string } | { names: readonly string[] } | { decision: 'once' | 'always' | 'reject'; message?: string } | { answer: Record<string, FormValue> } | { message?: string }

export function createConversationHttpClient(backendID: string, runtime: AgentRuntime): ConversationClient & Pick<AgentRuntime, 'listPendingForms' | 'listPendingPermissions'> {
  const catalogs = new Map<string, Promise<ProviderCatalog>>()
  const agents = new Map<string, Promise<Agent[]>>()
  const directoryOf = (directory?: string | null) => normalizePath(directory) ?? runtime.getDirectory()
  const urlOf = (path: string, directory: string | undefined, query: Record<string, string | number | boolean | null | undefined> = {}) => {
    const url = new URL(`${opencodeClient.getBaseUrl().replace(/\/api\/?$/, '')}${path}`)
    if (directory) url.searchParams.set('directory', toOpenCodeDirectory(directory))
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    return url.href
  }
  const request = async <T>(path: string, directory: string | undefined, method = 'GET', body?: ConversationBody, query?: Record<string, string | number | boolean | null | undefined>, signal?: AbortSignal): Promise<T> => {
    try {
      const response = await createRuntimeConversationFetch({ baseUrl: opencodeClient.getBaseUrl(), directory })(urlOf(path, directory, query), {
        method, headers: { 'Content-Type': 'application/json' }, ...body !== undefined && { body: JSON.stringify(body) }, ...signal && { signal },
      }).catch(error => {
        const failure = normalizeOpencodeError(path, error)
        if (!isDefiniteTransportFailure(failure)) markAmbiguousTransportFailure(failure)
        throw failure
      })
      if (!response.ok) {
        const failure: { error: string; tag?: string; ref?: string } = response.headers.get('content-type')?.includes('application/json') ? await response.json() : { error: await response.text() }
        throw new OpencodeApiError(path, failure.error, { status: response.status, tag: failure.tag, ref: failure.ref })
      }
      return JSON.parse(response.status === 204 ? 'null' : await response.text())
    } catch (error) { throw normalizeOpencodeError(path, error) }
  }
  const sessionPath = (id: string, suffix = '') => `${root}/${encodeURIComponent(id)}${suffix}`
  const assertCurrent = (key?: string) => { if (key && key !== getRuntimeKey()) throw new Error('Message was not sent because the runtime changed.') }
  const readAgents = async (directory?: string | null, sessionID?: string): Promise<Agent[]> => {
    const folder = directoryOf(directory)
    const key = JSON.stringify([getRuntimeKey(), folder, sessionID])
    const existing = agents.get(key)
    if (existing) return existing
    const operation = request<Agent[]>(`${catalogRoot}/agents`, folder, 'GET', undefined, { backendID, sessionID })
    agents.set(key, operation)
    try { return await operation } finally { if (agents.get(key) === operation) agents.delete(key) }
  }
  const pending = async <T extends { id: string }>(kind: string, options?: { directories?: string[] }): Promise<T[]> => {
    const directories = [...new Set(options?.directories?.map(normalizePath).filter((directory): directory is string => !!directory))]
    const lists = await Promise.all(directories.map(directory => request<T[]>(`/api/conversation-requests/${kind}`, directory)))
    return [...new Map(lists.flat().map(item => [item.id, item])).values()]
  }
  const client: ConversationClient & Pick<AgentRuntime, 'listPendingForms' | 'listPendingPermissions'> = {
    listSessionsPage: (options = {}) => request(root, options.global ? undefined : directoryOf(options.directory), 'GET', undefined, { global: options.global || undefined, limit: options.limit, order: options.order, search: options.search, cursor: options.cursor, parentID: options.parentID }),
    listSessions: async directory => (await client.listSessionsPage({ directory })).sessions,
    createSession: (params, directory) => request(root, directoryOf(directory), 'POST', { ...params, backendID: params?.backendID ?? backendID, model: params?.model && !isAutoModel(params.model.providerID, params.model.id) ? params.model : undefined }),
    getSession: (id, directory, signal) => request(sessionPath(id), directoryOf(directory), 'GET', undefined, undefined, signal),
    getSessionUnscoped: id => request(sessionPath(id), undefined),
    async captureSessionCleanup(directory, key) {
      const cleanup = await captureRuntimeCleanup(key)
      const folder = directoryOf(directory)
      return id => cleanup(async transport => {
        const url = new URL(`${transport.baseUrl}${sessionPath(id)}`)
        if (folder) url.searchParams.set('directory', toOpenCodeDirectory(folder))
        const response = await transport.fetch(url, { method: 'DELETE' })
        if (!response.ok && response.status !== 404) throw new OpencodeApiError('session.remove', await response.text(), { status: response.status })
      })
    },
    deleteSession: (id, directory) => request(sessionPath(id), directoryOf(directory), 'DELETE'),
    renameSession: async (id, title, directory) => { await request(sessionPath(id), directoryOf(directory), 'PATCH', { title }) },
    getSessionMessages: (id, options, directory) => request(sessionPath(id, '/message'), directoryOf(directory), 'GET', undefined, options),
    getSessionMessage: (id, messageID, directory) => request(sessionPath(id, `/message/${encodeURIComponent(messageID)}`), directoryOf(directory)),
    async getToolContentMessage(id, messageID, directory) {
      const key = getRuntimeKey()
      const result = await readMessageThroughAncestors(id, {
        readMessage: owner => client.getSessionMessage(owner, messageID, directory),
        readParentID: async owner => (await client.getSession(owner, directory)).parentID,
        isNotFound: error => error instanceof OpencodeApiError && error.status === 404,
        isCurrent: () => key === getRuntimeKey(),
      })
      return { info: { ...result.info, sessionID: id }, parts: result.parts.map(part => ({ ...part, sessionID: id })) }
    },
    getSessionInbox: (id, directory) => request(sessionPath(id, '/inbox'), directoryOf(directory)),
    switchSessionModel: async (id, model, directory) => { await request(sessionPath(id, '/model'), directoryOf(directory), 'POST', model) },
    switchSessionAgent: async (id, agent, directory) => { await request(sessionPath(id, '/agent'), directoryOf(directory), 'POST', { agent }) },
    async applySendSelection(id, selection, directory, key) {
      if (selection.agent) {
        assertCurrent(key)
        let available: Agent[] = []
        try { available = await readAgents(directory, id) }
        catch (error) { console.warn('[conversations] Could not check the agent before sending:', error) }
        if (available.length && !available.some(agent => agent.id === selection.agent)) throw new AgentUnavailableError(selection.agent, directoryOf(directory))
      }
      if (selection.model) { assertCurrent(key); await client.switchSessionModel(id, selection.model, directory) }
      if (selection.agent) { assertCurrent(key); await client.switchSessionAgent(id, selection.agent, directory) }
      assertCurrent(key)
    },
    sendMessage: input => sendConversationMessage(input, {
      assertCurrent: () => assertCurrent(input.runtimeKey),
      select: () => client.applySendSelection(input.id, { model: input.model, agent: input.agent }, input.directory, input.runtimeKey),
      skills: names => request<ConversationSkills>(sessionPath(input.id, '/skills'), directoryOf(input.directory), 'POST', { names }),
      context: context => request<ConversationContext[]>(sessionPath(input.id, '/context'), directoryOf(input.directory), 'POST', { ...context, delivery: input.delivery }),
      prompt: async prompt => { await request<{ id: string }>(sessionPath(input.id, '/prompt'), directoryOf(input.directory), 'POST', prompt) },
    }),
    abortSession: (id, directory) => request(sessionPath(id, '/interrupt'), directoryOf(directory), 'POST'),
    async getProvidersForConfig(directory, options) {
      const folder = directoryOf(directory)
      const key = JSON.stringify([getRuntimeKey(), folder, options?.sessionID])
      const isCurrent = captureRuntimeInstance()
      let existing = catalogs.get(key)
      if (existing && options?.fresh) { await existing.catch(() => undefined); if (!isCurrent()) throw new Error('Runtime instance changed'); existing = catalogs.get(key) }
      if (existing) return existing
      const spaceID = spaceIdOfDirectory(folder)
      const operation = (async () => {
        const result = await request<ProviderCatalog>(catalogRoot, folder, 'GET', undefined, { backendID, sessionID: options?.sessionID, includeProviders: spaceID ? false : undefined })
        const providers = spaceID ? await request<Provider[]>(`${catalogRoot}/providers`, getSpaceMark(spaceID)?.projectDirectory ?? undefined, 'GET', undefined, { backendID }) : result.providers
        return { ...result, providers: providers.map(withZenName) }
      })()
      catalogs.set(key, operation)
      try { return await operation } finally { if (catalogs.get(key) === operation) catalogs.delete(key) }
    },
    listAgents: directory => readAgents(directory),
    async replyToPermission(id, requestID, decision, options) {
      await request(sessionPath(id, `/permission/${encodeURIComponent(requestID)}/reply`), directoryOf(options?.directory), 'POST', { decision, message: options?.message })
      return true
    },
    async replyToForm(id, formID, answer, directory) {
      await request(sessionPath(id, `/form/${encodeURIComponent(formID)}/reply`), directoryOf(directory), 'POST', { answer })
      return true
    },
    async cancelForm(id, formID, directory, message) {
      await request(sessionPath(id, `/form/${encodeURIComponent(formID)}`), directoryOf(directory), 'DELETE', { message })
      return true
    },
    listPendingForms: options => pending<FormRequest>('forms', options),
    listPendingPermissions: options => pending<PermissionRequest>('permissions', options),
  }
  return client
}
