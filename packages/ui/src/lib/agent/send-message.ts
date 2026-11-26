import type { ConversationContext, ConversationPrompt, ConversationSkills } from '@openchamber/sdk/conversations/http'
import type { SendMessageInput, SyntheticContextInput } from './client'
import { ascendingId } from '../opencode/ids'
import { normalizeFilePart } from './files'
import { toJsonRecord } from '../opencode/json'
import { OpencodeApiError } from '../opencode/api-error'
import { AgentUnavailableError } from '../opencode/agent-unavailable-error'
import { isDefiniteTransportFailure } from '../relay/transport-error'
import { assertProviderCircuitClosed, recordProviderError, recordProviderSuccess } from '../opencode/provider-tracker'

type SendTransport = {
  assertCurrent(): void
  select(): Promise<void>
  context(input: ConversationContext): Promise<ConversationContext[]>
  skills(names: readonly string[]): Promise<ConversationSkills>
  prompt(input: ConversationPrompt): Promise<void>
}

export async function sendConversationMessage(params: SendMessageInput, transport: SendTransport): Promise<string> {
  transport.assertCurrent()

  const context = (params.context ?? [])
    .filter((item) => item.text.trim())
    .map((item) => ({ ...item, id: item.id ?? ascendingId("msg") }))
  const messageId = params.messageId ?? ascendingId("msg")
  const files = await Promise.all((params.files ?? []).map(normalizeFilePart))
  const agents = (params.agentMentions ?? [])
    .filter((mention) => !!mention?.name)
    .map((mention) => ({
      name: mention.name,
      mention: mention.source ? { start: mention.source.start, end: mention.source.end, text: mention.source.value } : undefined,
    }))

  if (!params.text.trim() && files.length === 0 && (params.context?.length ?? 0) === 0) {
    throw new Error("Message must have at least one part (text or file)")
  }

  assertProviderCircuitClosed(params.providerID)

  const deferred: ConversationContext[] = []
  let commitRevert = params.commitRevert
  const admitSynthetic = async (item: SyntheticContextInput) => {
    transport.assertCurrent()
    if (commitRevert) {
      await commitRevert()
      commitRevert = undefined
      transport.assertCurrent()
    }
    deferred.push(...await transport.context({ ...item, metadata: item.metadata ? toJsonRecord(item.metadata) : undefined }))
  }
  const prompt = (skills: readonly { id: string }[]) => {
    transport.assertCurrent()
    params.beforeSend?.()
    return transport.prompt({ id: messageId, text: params.text, files, agents, skills: [...skills], context: deferred, metadata: params.metadata, delivery: params.delivery })
  }

  try {
    await transport.select()
    const skills = await transport.skills(params.skills?.names ?? [])
    const unresolvedInstruction = params.skills?.instructionFor(skills.unresolved) ?? null
    for (const item of context) {
      await admitSynthetic(item)
    }
    if (unresolvedInstruction) await admitSynthetic({ text: unresolvedInstruction })
    try {
      await prompt(skills.attached)
    } catch (error) {
      if (skills.attached.length === 0 || !(error instanceof OpencodeApiError) || !(error.tag === "InvalidRequestError" && error.detail.startsWith("Skill not found"))) throw error
      const instruction = params.skills?.instructionFor(skills.attached.map((skill) => skill.name)) ?? null
      if (instruction) await admitSynthetic({ text: instruction })
      await prompt([])
    }
  } catch (error) {
    if (!(error instanceof AgentUnavailableError) && !(error instanceof Error && isDefiniteTransportFailure(error))) {
      recordProviderError(params.providerID, error instanceof OpencodeApiError ? error.status : undefined)
    }
    throw error
  }

  recordProviderSuccess(params.providerID)
  return messageId
}
