
import { z } from "zod"

import { compact, type Metadata, type Part, type ToolPart } from "./model"
import { isNavigationTool } from "./tools"

export const PART_SHELLS_HEADER = "x-openchamber-part-shells"

export const PART_SHELLS_VERSION = "v1"

const CONTENT_SHELL_METADATA_KEY = "openchamberContentShell"

const contentShellMarker = z.object({
  chars: z.number(),
  envelope: z.object({ ok: z.boolean(), action: z.string().min(1) }).optional().catch(undefined),
})

const recordedCall = z.object({
  tool: z.string(), status: z.enum(["completed", "error"]), output: z.string(),
  metadata: z.record(z.string(), z.json()).optional(),
}).catchall(z.json())
const nestedMarker = z.object({ metadata: z.object({ openchamberContentShell: contentShellMarker }) })

const readMarker = (part: Part) => {
  if (part.type !== "tool") return null
  if (part.state.status !== "completed" && part.state.status !== "error") return null
  const marker = contentShellMarker.safeParse(part.state.metadata?.[CONTENT_SHELL_METADATA_KEY])
  return marker.success ? marker.data : null
}

export function toolContentShellChars(part: Part): number | null {
  return readMarker(part)?.chars ?? null
}

/** A message fetch completes both top-level results and recorded Code Mode calls. */
export function hasShelledToolContent(part: Part): boolean {
  if (readMarker(part)) return true
  if (part.type !== "tool" || !("metadata" in part.state)) return false
  const calls = part.state.metadata?.openchamberToolCalls
  return Array.isArray(calls) && calls.some(call => nestedMarker.safeParse(call).success)
}

/** Preserve loaded results independently when a page mixes shells and whole calls. */
export function mergeToolContentShells(existing: ToolPart, next: ToolPart): ToolPart {
  if (existing.state.status !== next.state.status) return next
  if (!hasShelledToolContent(next)) return next
  if (!hasShelledToolContent(existing)) return existing
  const previous = "metadata" in existing.state ? existing.state.metadata?.openchamberToolCalls : undefined
  const incoming = "metadata" in next.state ? next.state.metadata?.openchamberToolCalls : undefined
  let changed = false
  const calls = Array.isArray(incoming) ? incoming.map((value, index) => {
    const old = Array.isArray(previous) ? previous[index] : undefined
    if (!nestedMarker.safeParse(value).success || nestedMarker.safeParse(old).success) return value
    const before = recordedCall.safeParse(old)
    const after = recordedCall.safeParse(value)
    if (!before.success || !after.success || before.data.tool !== after.data.tool
      || before.data.status !== after.data.status || JSON.stringify(before.data.input) !== JSON.stringify(after.data.input)) return value
    changed = true
    return before.data
  }) : incoming
  const keepOutput = readMarker(next) !== null && readMarker(existing) === null
  if (!changed && !keepOutput) return next
  if (!("metadata" in next.state) || !("output" in existing.state)) return next
  const metadata: Metadata = { ...next.state.metadata }
  if (changed && Array.isArray(calls)) metadata.openchamberToolCalls = calls
  if (keepOutput) delete metadata[CONTENT_SHELL_METADATA_KEY]
  if (keepOutput && existing.state.status === "completed" && next.state.status === "completed") return { ...next, state: {
    ...next.state, output: existing.state.output, attachments: existing.state.attachments, metadata,
  } }
  if (keepOutput && next.state.status === "error") return { ...next, state: { ...next.state, output: existing.state.output, metadata } }
  return { ...next, state: { ...next.state, metadata } }
}

/**
 * The action and outcome of the OpenChamber tool envelope the server left out
 * of this call, or `null` when it left out none.
 */
export function toolContentShellEnvelope(part: Part): { ok: boolean; action: string } | null {
  return readMarker(part)?.envelope ?? null
}

export function withoutUnshownResult(part: ToolPart): ToolPart {
  if ("metadata" in part.state && Array.isArray(part.state.metadata?.openchamberToolCalls)) {
    let changed = false
    const calls = part.state.metadata.openchamberToolCalls.map(value => {
      const parsed = recordedCall.safeParse(value)
      if (!parsed.success || !isNavigationTool(parsed.data.tool) || !parsed.data.output
        || nestedMarker.safeParse(value).success) return value
      const call = parsed.data
      changed = true
      return { ...call, output: "", metadata: { ...call.metadata, [CONTENT_SHELL_METADATA_KEY]: { chars: call.output.length } } }
    })
    if (changed) part = { ...part, state: { ...part.state, metadata: { ...part.state.metadata, openchamberToolCalls: calls } } }
  }
  if (!isNavigationTool(part.tool) || toolContentShellChars(part) !== null) return part
  const state = part.state
  if (state.status !== "completed" && state.status !== "error") return part
  const chars = state.output?.length ?? 0
  if (chars === 0 && !(state.status === "completed" && state.attachments?.length)) return part
  const metadata = { ...state.metadata, [CONTENT_SHELL_METADATA_KEY]: { chars } }
  if (state.status === "error") return { ...part, state: compact({ ...state, output: undefined, metadata }) }
  return { ...part, state: compact({ ...state, output: "", attachments: undefined, metadata }) }
}
