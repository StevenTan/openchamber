import { describe, expect, test } from "bun:test"

import type { JsonValue } from "./model"
import { projectToolPart } from "./projection"
import { hasShelledToolContent, toolContentShellChars, toolContentShellEnvelope, withoutUnshownResult } from "./toolContentShells"

const owner = { sessionID: "ses_1", messageID: "msg_1" }

describe("toolContentShellChars", () => {
  test("compacts recorded navigation results and recognizes them inside a whole script", () => {
    const whole = projectToolPart({
      type: "tool", id: "script", name: "execute", time: { created: 1, ran: 2, completed: 3 },
      state: { status: "completed", input: {}, content: [{ type: "text", text: "Script answer" }], metadata: {
        openchamberToolCalls: [
          { tool: "read", status: "completed", input: { path: "a.ts" }, output: "FILE_BODY", time: { start: 1, end: 2 } },
          { tool: "edit", status: "completed", input: { path: "a.ts" }, output: "Edited", time: { start: 2, end: 3 } },
        ],
      } },
    }, owner)
    expect(hasShelledToolContent(whole)).toBe(false)
    const shelled = withoutUnshownResult(whole)
    expect(toolContentShellChars(shelled)).toBeNull()
    expect(hasShelledToolContent(shelled)).toBe(true)
    expect(JSON.stringify(shelled)).not.toContain("FILE_BODY")
    expect(JSON.stringify(shelled)).toContain("Edited")
    expect(JSON.stringify(whole)).toContain("FILE_BODY")
    expect(withoutUnshownResult(shelled)).toBe(shelled)
  })
  test("reads the marker the server puts on a shelled call", () => {
    const part = projectToolPart({
      type: "tool",
      id: "call_1",
      name: "read",
      time: { created: 1, ran: 2, completed: 3 },
      state: { status: "completed", input: { path: "a.ts" }, content: [{ type: "text", text: "" }], metadata: { openchamberContentShell: { chars: 120 } } },
    }, owner)
    expect(toolContentShellChars(part)).toBe(120)
  })

  test("treats a call without a well-formed marker as whole", () => {
    const whole = projectToolPart({
      type: "tool",
      id: "call_1",
      name: "read",
      time: { created: 1, ran: 2, completed: 3 },
      state: { status: "completed", input: {}, content: [{ type: "text", text: "body" }], metadata: { openchamberContentShell: "yes" } },
    }, owner)
    expect(toolContentShellChars(whole)).toBeNull()
    const running = projectToolPart({
      type: "tool",
      id: "call_2",
      name: "shell",
      time: { created: 1, ran: 2 },
      state: { status: "running", input: {}, metadata: { openchamberContentShell: { chars: 1 } } },
    }, owner)
    expect(toolContentShellChars(running)).toBeNull()
  })
})

describe("toolContentShellEnvelope", () => {
  const shelled = (marker: JsonValue) => projectToolPart({
    type: "tool",
    id: "call_1",
    name: "execute",
    time: { created: 1, ran: 2, completed: 3 },
    state: { status: "completed", input: {}, content: [{ type: "text", text: "" }], metadata: { openchamberContentShell: marker } },
  }, owner)

  test("reads the action and outcome the server kept of a left-out envelope", () => {
    expect(toolContentShellEnvelope(shelled({ chars: 90, envelope: { ok: true, action: "memory.save" } }))).toEqual({ ok: true, action: "memory.save" })
  })

  test("is null when the left-out result was no envelope, and a broken one keeps the length", () => {
    expect(toolContentShellEnvelope(shelled({ chars: 90 }))).toBeNull()
    const broken = shelled({ chars: 90, envelope: { ok: "yes" } })
    expect(toolContentShellEnvelope(broken)).toBeNull()
    expect(toolContentShellChars(broken)).toBe(90)
  })
})
