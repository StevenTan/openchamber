export const partIds = {
  text: (messageID: string, ordinal: number) => `${messageID}:text:${ordinal}`,
  reasoning: (messageID: string, ordinal: number) => `${messageID}:reasoning:${ordinal}`,
  tool: (callID: string) => callID,
  userText: (messageID: string) => `${messageID}:text:0`,
  userFile: (messageID: string, index: number) => `${messageID}:file:${index}`,
  userAgent: (messageID: string, index: number) => `${messageID}:agent:${index}`,
} as const


export function compact<T extends object>(value: T): T {
  // SAFETY: only keys with an undefined value are dropped; every remaining
  // key keeps its declared type, so the result still satisfies T.
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
