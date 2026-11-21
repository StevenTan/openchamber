import type { AgentBackend } from './backend'
import type { Session } from './model'
import { getRuntimeKey } from '../runtime-switch'

const factories = new Map<string, () => AgentBackend>()
const sessionBackends = new Map<string, Map<string, string>>()
let selectedBackendID: string

export function registerAgentBackend(id: string, factory: () => AgentBackend): void {
  factories.set(id, factory)
}

export function selectAgentBackend(id: string): void {
  selectedBackendID = id
}

export function getAgentBackend(id = selectedBackendID): AgentBackend {
  const factory = factories.get(id)
  if (!factory) throw new Error(`Agent backend is not registered: ${id}`)
  return factory()
}

export function rememberSessionBackend(session: Session): void {
  const key = getRuntimeKey()
  let owners = sessionBackends.get(key)
  if (!owners) sessionBackends.set(key, owners = new Map())
  owners.set(session.id, session.backendID ?? 'opencode')
}

export function getSessionBackend(sessionID: string): AgentBackend {
  return getAgentBackend(sessionBackends.get(getRuntimeKey())?.get(sessionID) ?? selectedBackendID)
}
