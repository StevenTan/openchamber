export const buildSkillMentionInstruction = (skillNames: readonly string[]): string | null => {
  if (skillNames.length === 0) return null
  const formatted = skillNames.map((name) => `$${name}`).join(", ")
  return `The user explicitly mentioned these skills in their message: ${formatted}. Read their SKILL.md files from the current skill catalog and follow their instructions when relevant to the user's request.`
}
