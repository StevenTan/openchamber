import type { MessagePatch, ToolTransition } from "./events.js"
import type { Message, ToolPart } from "./model.js"
import { compact } from "./identities.js"

const isFinalToolStatus = (status: string) => status === "completed" || status === "error"

export function applyMessagePatch(message: Message, patch: MessagePatch): Message {
  if (message.role === "assistant") {
    const next = { ...message }
    if (patch.time) next.time = compact({ ...message.time, ...patch.time })
    if (patch.finish !== undefined) next.finish = patch.finish
    if (patch.error !== undefined) next.error = patch.error
    else if (patch.time?.completed !== undefined && message.closedLocally) delete next.error
    if (patch.error !== undefined || patch.time?.completed !== undefined) delete next.closedLocally
    if (patch.cost !== undefined) next.cost = patch.cost
    if (patch.tokens !== undefined) next.tokens = patch.tokens
    if (patch.snapshot) next.snapshot = compact({ ...message.snapshot, ...patch.snapshot })
    if (patch.retry === null) delete next.retry
    else if (patch.retry !== undefined) next.retry = patch.retry
    return next
  }
  if (message.role === "shell") {
    const next = { ...message }
    if (patch.time?.completed !== undefined) next.time = { ...message.time, completed: patch.time.completed }
    if (patch.shell) {
      next.status = patch.shell.status
      if (patch.shell.exit !== undefined) next.exit = patch.shell.exit
      if (patch.shell.signal !== undefined) next.signal = patch.shell.signal
      if (patch.shell.output !== undefined) next.output = patch.shell.output
    }
    return next
  }
  if (patch.time?.created !== undefined) {
    const next = { ...message, time: { ...message.time, created: patch.time.created } }
    if (next.role === "synthetic") delete next.pending
    return next
  }
  return message
}

function isLocallyMarkedToolState(state: ToolPart["state"]): boolean {
  return state.status === "error" && state.errorSource === "local"
}

export function applyToolTransition(part: ToolPart, transition: ToolTransition): ToolPart {
  const state = part.state
  switch (transition.kind) {
    case "input":
      if (state.status !== "pending") return part
      return { ...part, state: { ...state, raw: transition.raw } }
    case "called":
      if (isFinalToolStatus(state.status)) return part
      return {
        ...part,
        executed: transition.executed,
        state: { status: "running", input: transition.input, time: { start: transition.start } },
      }
    case "progress":
      if (state.status !== "running") return part
      return { ...part, state: { ...state, metadata: transition.metadata } }
    case "success": {
      if (isFinalToolStatus(state.status) && !isLocallyMarkedToolState(state)) return part
      const start = state.status === "pending" ? transition.end : state.time.start
      const attachments = transition.attachments
      return {
        ...part,
        executed: transition.executed,
        state: compact({
          status: "completed",
          input: state.input,
          output: transition.output,
          metadata: transition.metadata ?? (state.status === "running" ? state.metadata : undefined),
          time: { start, end: transition.end },
          attachments,
        }),
      }
    }
    case "failed": {
      if (isFinalToolStatus(state.status) && !isLocallyMarkedToolState(state)) return part
      const start = state.status === "pending" ? transition.end : state.time.start
      return {
        ...part,
        executed: transition.executed,
        state: compact({
          status: "error",
          input: state.input,
          error: transition.error,
          errorType: transition.errorType,
          output: transition.output,
          metadata: transition.metadata ?? (state.status === "running" ? state.metadata : undefined),
          time: { start, end: transition.end },
        }),
      }
    }
  }
}

