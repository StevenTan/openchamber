import type { Project } from "@/lib/agent/model"
import { getAgentBackend } from "@/lib/agent/active"
import type { AgentRuntime } from "@/lib/agent/runtime"
import { retry } from "./retry"
import type { GlobalState, State } from "./types"
import { emitSyncConfigChanged } from "./sync-refs"
import { warmChatsRootDirectory } from "../lib/chatDirectories"
import { runBackgroundNetworkTask } from "../lib/background-network"
import { refreshBackgroundShells } from "./background-shells"
import {
  readDirectoryStatusSnapshot,
  selectHeldSessionStatuses,
  readDirectoryFormSnapshot,
  readDirectoryPermissionSnapshot,
  type DirectoryRecoverySource,
} from "./directory-recovery-snapshots"
import { noteQuestionFormSnapshot } from "./recoverable-questions"

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function projectID(directory: string, projects: Project[]) {
  return projects.find(
    (project) => project.worktree === directory || project.sandboxes?.includes(directory),
  )?.id
}


export async function bootstrapGlobal(set: (patch: Partial<GlobalState>) => void, runtime: AgentRuntime = getAgentBackend().runtime) {
  const results = await Promise.allSettled([
    warmChatsRootDirectory(),
    retry(async () => {
      const [location, home] = await Promise.all([runtime.getLocation(), runtime.getFilesystemHome()])
      set({ path: { directory: location.directory, worktree: location.project.directory, home: home ?? "" } })
    }),
    retry(() => runtime.getConfiguration().then((config) => set({ config }))),
    retry(() =>
      runtime.listProjects().then((data) => {
        const projects = data
          .filter((p) => !!p.worktree && !p.worktree.includes("opencode-test"))
          .sort((a, b) => cmp(a.id, b.id))
        set({ projects })
      }),
    ),
  ])

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason)
  if (errors.length) {
    console.error("[bootstrap] global bootstrap failed", errors[0])
  }

  if (errors.length === results.length) {
    const message = await runtime.getInitializationError(errors[0] instanceof Error ? errors[0].message : String(errors[0]))
    set({ ready: true, error: { type: "init", message } })
  } else {
    set({ ready: true, error: undefined })
  }
}


type DirectoryBootstrapInput = {
  directory: string
  runtime?: AgentRuntime
  store: DirectoryRecoverySource
  set: (patch: Partial<State>) => void
  isStale?: () => boolean
  global: {
    config: State["config"]
    projects: Project[]
    path: GlobalState["path"]
  }
  loadSessions: (directory: string) => Promise<void> | void
}

type BootstrapResult = "complete" | "failed" | "stale"

export function bootstrapDirectory(input: DirectoryBootstrapInput) {
  const sessions = (async (): Promise<BootstrapResult> => {
    if (input.isStale?.()) return "stale"
    try {
      await input.loadSessions(input.directory)
      return input.isStale?.() ? "stale" : "complete"
    } catch (error) {
      if (input.isStale?.()) return "stale"
      console.error(`[bootstrap] session load failed for ${input.directory}`, error)
      return "failed"
    }
  })()
  const environment = initializeDirectory(input, sessions)
  return { sessions, environment }
}

async function initializeDirectory(input: DirectoryBootstrapInput, sessions: Promise<BootstrapResult>): Promise<BootstrapResult> {
  const { directory, store, set, global: g } = input
  const runtime = input.runtime ?? getAgentBackend().runtime
  const read = <T>(request: () => Promise<T>, priority?: "active-session") => retry(() => runBackgroundNetworkTask(() => {
    if (input.isStale?.()) throw new Error("Directory initialization superseded")
    return request()
  }, priority))
  const commit = (patch: Partial<State>): boolean => {
    if (input.isStale?.()) return false
    set(patch)
    return true
  }
  const state = store.getState()

  const seededProject = projectID(directory, g.projects)
  if (seededProject) commit({ project: seededProject })
  if (Object.keys(state.config ?? {}).length === 0 && Object.keys(g.config ?? {}).length > 0) {
    if (commit({ config: g.config })) emitSyncConfigChanged(directory, g.config)
  }
  commit({ status: "partial" })
  if (input.isStale?.()) return "stale"

  const critical = Promise.allSettled([
    sessions.then(async (listed) => {
      if (listed !== "complete") return
      await read(async () => {
        const session_status = await readDirectoryStatusSnapshot(store, async () => {
          const statuses = await runtime.getActiveSessionStatuses(directory)
          if (statuses === null) throw new Error("session.active failed")
          return selectHeldSessionStatuses(statuses, store.getState().session)
        })
        commit({ session_status, sessionStatusReady: true })
      }, "active-session")
    }),
    read(async () => {
      const form = await readDirectoryFormSnapshot(store, () => (
        runtime.listPendingForms({ directories: [directory] })
      ))
      if (commit({ form })) noteQuestionFormSnapshot(directory, Object.values(form).flat())
    }),
    read(async () => {
      const permission = await readDirectoryPermissionSnapshot(store, () => (
        runtime.listPendingPermissions({ directories: [directory] })
      ))
      commit({ permission })
    }),
    read(() => runtime.getConfiguration(directory).then((config) => {
      if (commit({ config })) emitSyncConfigChanged(directory, config)
    })),
    read(() =>
      runtime.getLocation(directory).then((location) => {
        commit({
          project: location.project.id,
          path: { directory: location.directory, worktree: location.project.directory, home: g.path.home },
        })
      }),
    ),
  ])
  const enrichment = Promise.allSettled([
    read(() => runtime.getVcs(directory).then((vcs) => commit({ vcs }))),
    read(() => refreshBackgroundShells(directory, (target) => runtime.listRunningShells(target))),
  ])
  const [results, enrichmentResults] = await Promise.all([critical, enrichment])
  if (input.isStale?.()) return "stale"
  const enrichmentErrors = enrichmentResults.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (enrichmentErrors.length) console.warn(`[bootstrap] optional enrichment failed for ${directory}`, enrichmentErrors[0].reason)
  const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (errors.length) {
    console.error(`[bootstrap] environment initialization failed for ${directory}`, errors[0].reason)
    return "failed"
  }
  commit({ status: "complete" })
  return "complete"
}
