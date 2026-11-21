import { Effect } from "effect";
import type { Skill } from "@opencode/schema/skill";
import type { Permission } from "@opencode/schema/permission";
import { Tool } from "@opencode/schema/tool";

export interface SkillRegistry {
  list(): Effect.Effect<{ data: readonly Skill.Info[] }>;
}

interface InstructionSource { key: string; text: string }
interface SystemPart {
  text: string;
  metadata?: { experimental?: { instructions?: InstructionSource[] } };
}

const virtual = (skill: Skill.Info) => skill.path.startsWith("skill://");

function match(input: string, pattern: string) {
  let escaped = pattern.replaceAll("\\", "/").replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*").replace(/\?/g, ".");
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?";
  return new RegExp(`^${escaped}$`, process.platform === "win32" ? "si" : "s").test(input.replaceAll("\\", "/"));
}

export function filterVirtualSkillGuidance(system: SystemPart[], skills: readonly Skill.Info[], rules: Permission.Ruleset) {
  if (!skills.some(virtual)) return;
  const available = skills.filter(skill => !virtual(skill) && skill.description !== undefined && skill.autoinvoke !== false
    && [...rules].reverse().find(rule => match("skill", rule.action) && match(skill.id, rule.resource))?.effect !== "deny")
    .sort((a, b) => a.id.localeCompare(b.id));
  const text = [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    "The user may also invoke a skill directly. When that happens, its instructions appear in the conversation as a <skill_content> block, the same shape the skill tool returns. A skill that is already present this way does not need to be invoked again.",
    ...(available.length === 0 ? ["No skills are currently available."] : [
      "<available_skills>",
      ...available.flatMap(skill => [
        "  <skill>", `    <id>${skill.id}</id>`, `    <name>${skill.name}</name>`,
        `    <description>${skill.description}</description>`, "  </skill>",
      ]),
      "</available_skills>",
    ]),
  ].join("\n");
  for (const part of system) {
    const sources = part.metadata?.experimental?.instructions;
    if (!sources?.some(source => source.key === "core/skill-guidance")) continue;
    const instructions = sources.map(source => source.key === "core/skill-guidance" ? { ...source, text } : source);
    part.metadata = { ...part.metadata, experimental: { ...part.metadata?.experimental, instructions } };
    part.text = instructions.map(source => source.text).join("\n\n");
  }
}

export function assertFileSkill(registry: SkillRegistry, id: string) {
  return Effect.gen(function* () {
    const { data } = yield* registry.list();
    if (data.some(skill => skill.id === id && virtual(skill))) {
      return yield* Effect.fail(new Tool.Error({ message: `Virtual skill '${id}' is disabled. Use a file-backed skill.` }));
    }
  });
}
