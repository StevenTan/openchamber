import { describe, expect, test } from 'bun:test'
import { conversationClient } from './active'
import { registerAgentBackend } from './registry'
import { createApplicationBackend } from './application'
import { createOpenCodeBackend } from '../opencode/backend'
import type { Session } from './model'
import type { AgentBackend } from './backend'

describe('conversation backend routing', () => {
  test('session operations retain their owner while new sessions use the selected backend', async () => {
    const calls: string[] = []
    for (const id of ['first', 'second']) {
      const backend = createOpenCodeBackend()
      let modelID = ''
      const session: Session = {
        id: `session-${id}`, backendID: id, projectID: 'project', directory: '/project', title: id,
        cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1, updated: 1 },
      }
      registerAgentBackend(id, () => ({
        ...backend,
        id,
        client: {
          ...backend.client,
          createSession: async () => session,
          abortSession: async (sessionID) => { calls.push(`${id}:${sessionID}`); return true },
          getSessionUnscoped: async () => session,
          captureSessionCleanup: async (directory, runtimeKey) => async (sessionID) => {
            calls.push(`${id}:cleanup:${directory}:${runtimeKey}:${sessionID}`)
          },
          applySendSelection: async (_sessionID, selection) => { modelID = selection.model?.id ?? '' },
          getToolContentMessage: async (sessionID, messageID) => ({
            info: { id: messageID, sessionID, role: 'user', time: { created: 1 } },
            parts: [{ id: 'text', sessionID, messageID, type: 'text', text: modelID }],
          }),
        },
      }))
    }
    const first = await conversationClient.createSession({ backendID: 'first' })
    const cleanup = await conversationClient.captureSessionCleanup('/project', 'runtime', 'first')
    const second = await conversationClient.createSession({ backendID: 'second' })
    await conversationClient.abortSession(first.id)
    await conversationClient.abortSession(second.id)
    expect(await conversationClient.getSessionUnscoped(first.id)).toBe(first)
    await conversationClient.applySendSelection(first.id, { model: { providerID: 'provider', id: 'selected' } }, '/project', 'runtime')
    const content = await conversationClient.getToolContentMessage(first.id, 'message', '/project')
    expect(content.parts).toEqual([{ id: 'text', sessionID: first.id, messageID: 'message', type: 'text', text: 'selected' }])
    await cleanup(first.id)
    expect(calls).toEqual(['first:session-first', 'second:session-second', 'first:cleanup:/project:runtime:session-first'])
  })

  test('history records establish the backend used for subsequent messages', async () => {
    const session: Session = {
      id: 'history-session', backendID: 'history', projectID: 'project', directory: '/project', title: 'History',
      cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
    }
    const backend = createOpenCodeBackend()
    const messages: string[] = []
    const history: AgentBackend = {
      ...backend,
      id: 'history',
      client: {
        ...backend.client,
        listSessionsPage: async () => ({ sessions: [session], cursor: {} }),
        sendMessage: async (input) => { messages.push(input.text); return 'message' },
      },
    }
    registerAgentBackend('history', () => history)
    const standard = { ...backend, client: { ...backend.client, listSessionsPage: async () => ({ sessions: [session], cursor: {} }) } }
    registerAgentBackend('application', () => createApplicationBackend(standard, { ...history, client: { ...history.client, listSessions: async () => [session] } }))
    await conversationClient.listSessionsPage()
    await conversationClient.sendMessage({ id: session.id, providerID: 'provider', text: 'Continue' })
    expect(messages).toEqual(['Continue'])
  })
})
