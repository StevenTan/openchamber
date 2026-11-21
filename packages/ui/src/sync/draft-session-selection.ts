import type { AgentBackendId } from "@/lib/agent-backends/model"
import type { SessionCreateSelection } from "./session-actions"

export type DraftSessionSelection = {
  providerID: string
  modelID: string
  agent?: string
  variant?: string | null
  backend?: AgentBackendId
}

export const trimAgent = (agent: string | undefined): string | undefined => (
  typeof agent === "string" && agent.trim().length > 0 ? agent.trim() : undefined
)

export const draftSessionCreateSelection = (selection: DraftSessionSelection): SessionCreateSelection => ({
  model: { providerID: selection.providerID, id: selection.modelID, variant: selection.variant },
  agent: trimAgent(selection.agent),
  backend: selection.backend ?? 'opencode',
})
