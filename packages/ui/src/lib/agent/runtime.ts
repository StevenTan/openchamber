import type { FormRequest, PermissionRequest } from './requests'
import type { Project, RunningImageJob, RunningShell, SessionStatus, Vcs } from './model'

export type BackendHealth = 'healthy' | 'unhealthy' | 'unreachable'
export type DirectoryAvailability = 'available' | 'missing' | 'unknown'
export type ConversationConfiguration = { defaultAgent?: string; defaultModel?: string }
export type ConversationLocation = { directory: string; project: { id: string; directory: string; canonical: string } }

export interface AgentRuntime {
  checkHealth(): Promise<boolean>
  probeHealth(options?: { waitMs?: number }): Promise<BackendHealth>
  getDirectory(): string | undefined
  setDirectory(directory: string | undefined): void
  getDirectoryAvailability(directory: string): Promise<DirectoryAvailability>
  classifyDirectoryError(error: Error | undefined, directory: string): Promise<'trust-pending' | 'missing' | 'failed'>
  isNotFoundError(error: Error): boolean
  reconnectToRuntimeBaseUrl(): void
  prepare(): void
  releaseLocation(directory: string): Promise<void>
  getLocation(directory?: string | null): Promise<ConversationLocation>
  getFilesystemHome(): Promise<string | null>
  clearConfigurationCache(): void
  getConfiguration(directory?: string | null): Promise<ConversationConfiguration>
  listProjects(): Promise<Project[]>
  getVcs(directory?: string | null): Promise<Vcs>
  getActiveSessionStatuses(directory?: string | null): Promise<Record<string, SessionStatus> | null>
  listPendingForms(options?: { directories?: string[] }): Promise<FormRequest[]>
  listPendingPermissions(options?: { directories?: string[] }): Promise<PermissionRequest[]>
  listRunningShells(directory: string): Promise<{ directory: string; shells: RunningShell[] }>
  listRunningImageJobs(): Promise<RunningImageJob[] | null>
  getInitializationError(message: string): Promise<string>
}
