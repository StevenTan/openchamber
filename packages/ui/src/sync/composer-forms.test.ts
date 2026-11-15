import { describe, expect, test } from "bun:test"
import type { FormRequest, Session } from "@/lib/opencode/model"

import { collectComposerForms, collectBlockingComposerForms } from "./sync-context"
import { LOCATION_SCOPED_FORM_SESSION_ID } from "./location-scoped-forms"

// SAFETY: subtree scoping reads only `id` and `parentID`; the other session fields are never touched here.
const session = (id: string, parentID?: string): Session => ({ id, parentID }) as Session
const form = (id: string, sessionID: string): FormRequest => ({ id, sessionID, title: id, fields: [{ key: "answer", type: "boolean" }] })

describe("composer forms", () => {
  const empty: FormRequest[] = []
  const own = form("form_own", "ses_root")
  const child = form("form_child", "ses_child")
  const elicitation = form("form_mcp", LOCATION_SCOPED_FORM_SESSION_ID)
  const sessions = [session("ses_root"), session("ses_child", "ses_root"), session("ses_other")]

  test("a location-scoped form follows the session subtree's own forms", () => {
    const result = collectComposerForms(
      sessions,
      { ses_root: [own], ses_child: [child], [LOCATION_SCOPED_FORM_SESSION_ID]: [elicitation] },
      "ses_root",
      empty,
    )
    expect(result).toEqual([own, child, elicitation])
  })

  test("a location-scoped form reaches a session with no forms of its own", () => {
    const result = collectComposerForms(sessions, { [LOCATION_SCOPED_FORM_SESSION_ID]: [elicitation] }, "ses_other", empty)
    expect(result).toEqual([elicitation])
  })

  test("without a session there is nothing to show it from", () => {
    expect(collectComposerForms(sessions, { [LOCATION_SCOPED_FORM_SESSION_ID]: [elicitation] }, null, empty)).toBe(empty)
  })

  test("the shared empty list survives when neither kind is pending", () => {
    expect(collectComposerForms(sessions, { [LOCATION_SCOPED_FORM_SESSION_ID]: [] }, "ses_root", empty)).toBe(empty)
  })

  test("async questions stay visible without blocking session activity", () => {
    const asyncQuestion = { ...form("form_async", "ses_root"), metadata: { kind: "openchamber-async-question", order: 1 } }
    const pending = { ses_root: [asyncQuestion, own] }
    expect(collectComposerForms(sessions, pending, "ses_root", empty)).toEqual([asyncQuestion, own])
    expect(collectBlockingComposerForms(sessions, pending, "ses_root", empty)).toEqual([own])
    expect(collectBlockingComposerForms(sessions, { ses_root: [asyncQuestion] }, "ses_root", empty)).toBe(empty)
  })

  test("async questions retain request order after an ID-sorted snapshot", () => {
    const first = { ...form("form_z", "ses_root"), metadata: { kind: "openchamber-async-question", order: 1 } }
    const second = { ...form("form_a", "ses_root"), metadata: { kind: "openchamber-async-question", order: 2 } }
    expect(collectComposerForms(sessions, { ses_root: [second, first] }, "ses_root", empty)).toEqual([first, second])
  })
})
