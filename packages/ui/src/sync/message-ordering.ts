import type { Message } from "@/lib/opencode/model"

type MessageOrderKey = Pick<Message, 'id' | 'role' | 'time'>

const getCreatedAt = (message: MessageOrderKey): number => {
  const value = (message as { time?: { created?: unknown } }).time?.created
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * Within one millisecond a synthetic record goes first. Context attached to a
 * prompt is written right before it and often shares its millisecond, while
 * the prompt's id is minted earlier on the client, so the ID alone would put
 * that context after the prompt it belongs to.
 */
const equalTimeRank = (message: MessageOrderKey): number => (message.role === "synthetic" ? 0 : 1)

/**
 * Message IDs identify records; they are not chronology. OpenCode's sortable
 * ID timestamp rolls over, so a newly created `msg_000...` can follow a legacy
 * `msg_fff...`. Creation time is the authoritative transcript order, with ID
 * used only to make equal timestamps deterministic.
 */
export const compareMessagesChronologically = (left: MessageOrderKey, right: MessageOrderKey): number => {
  const createdAtDifference = getCreatedAt(left) - getCreatedAt(right)
  if (createdAtDifference !== 0) return createdAtDifference
  const rankDifference = equalTimeRank(left) - equalTimeRank(right)
  if (rankDifference !== 0) return rankDifference
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

export const findMessageIndex = (messages: readonly Message[], messageID: string): number => (
  messages.findIndex((message) => message.id === messageID)
)

export const insertMessageInEventOrder = <T extends Message>(messages: T[], message: T): number => {
  let prompt = -1
  if (message.role === "synthetic" && !message.pending) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "user" || messages[i].time.created !== message.time.created) continue
      prompt = i
      break
    }
  }
  const index = prompt < 0 ? messages.length : prompt
  messages.splice(index, 0, message)
  return index
}

export const messagesBefore = <T extends Message>(messages: readonly T[], messageID?: string): T[] => {
  if (!messageID) return messages as T[]
  const index = findMessageIndex(messages, messageID)
  return index < 0 ? messages as T[] : messages.slice(0, index)
}

export const messagesFrom = <T extends Message>(messages: readonly T[], messageID?: string): T[] => {
  if (!messageID) return []
  const index = findMessageIndex(messages, messageID)
  return index < 0 ? [] : messages.slice(index)
}
