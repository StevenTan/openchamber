import { z } from "zod"
import type { Metadata, RunningShell } from "./model.js"
export type { ShellEnd } from "./model.js"

const shellOwnerSchema = z.object({ sessionID: z.string().min(1) })

type ShellInfoWire = {
  id: string
  status: string
  command: string
  file: string
  metadata: Metadata
  time: { started: number }
}

export function runningShellFromWire(info: ShellInfoWire): RunningShell | undefined {
  if (info.status !== "running") return undefined
  const owner = shellOwnerSchema.safeParse(info.metadata)
  if (!owner.success) return undefined
  return { id: info.id, sessionID: owner.data.sessionID, command: info.command, file: info.file, startedAt: info.time.started }
}
