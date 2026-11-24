import type { AgentRuntime } from '../agent/runtime'
import { isOpencodeNotFound, opencodeClient } from './client'
import { OpencodeApiError } from './api-error'
import { isOpenCodeTrustPending } from '../opencodeTrust'
import { isLocationNotFoundError } from './location-errors'
import { configModelIdentifier } from './projection'
import { compact } from './model'
import { runtimeFetch } from '../runtime-fetch'

export const openCodeRuntime: AgentRuntime = {
  checkHealth: () => opencodeClient.checkHealth(),
  probeHealth: (options) => opencodeClient.probeHealth(options),
  getDirectory: () => opencodeClient.getDirectory(),
  setDirectory: (directory) => opencodeClient.setDirectory(directory),
  getDirectoryAvailability: (directory) => opencodeClient.getDirectoryAvailability(directory),
  async classifyDirectoryError(error, directory) {
    if (error instanceof OpencodeApiError && error.status === 403 && await isOpenCodeTrustPending(directory)) return 'trust-pending'
    if (isLocationNotFoundError(error) || await opencodeClient.getDirectoryAvailability(directory) === 'missing') return 'missing'
    return 'failed'
  },
  isNotFoundError: isOpencodeNotFound,
  reconnectToRuntimeBaseUrl: () => opencodeClient.reconnectToRuntimeBaseUrl(),
  prepare: () => opencodeClient.learnMessagePageShellsSupport(),
  releaseLocation: (directory) => opencodeClient.releaseLocation(directory),
  getLocation: (directory) => opencodeClient.getLocation(directory),
  getFilesystemHome: () => opencodeClient.getFilesystemHome(),
  clearConfigurationCache: () => opencodeClient.clearConfigCache(),
  async getConfiguration(directory) {
    const config = await opencodeClient.getConfig(directory)
    return compact({ defaultAgent: config.default_agent, defaultModel: configModelIdentifier(config.model) })
  },
  listProjects: () => opencodeClient.listProjects(),
  getVcs: (directory) => opencodeClient.getVcs(directory),
  getActiveSessionStatuses: (directory) => opencodeClient.getActiveSessionStatuses(directory),
  listPendingForms: (options) => opencodeClient.listPendingForms(options),
  listPendingPermissions: (options) => opencodeClient.listPendingPermissions(options),
  listRunningShells: (directory) => opencodeClient.listRunningShells(directory),
  listRunningImageJobs: () => opencodeClient.listRunningImageJobs(),
  async getInitializationError(message) {
    try {
      const response = await runtimeFetch('/health', { signal: AbortSignal.timeout(4000) })
      if (response.ok) {
        const health = await response.json()
        if (health.lastOpenCodeError) message = health.lastOpenCodeError
        else if (!health.openCodeRunning) message = 'OpenCode process is not running'
      }
    } catch { return message }
    return message
  },
}
