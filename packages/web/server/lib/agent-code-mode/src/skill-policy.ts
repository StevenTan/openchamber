import { Effect } from "effect";
import type { Skill } from "@opencode/schema/skill";
import { Tool } from "@opencode/schema/tool";

export interface SkillRegistry {
  list(): Effect.Effect<{ data: readonly Skill.Info[] }>;
}

const virtual = (skill: Skill.Info) => skill.path.startsWith("skill://");

export function assertFileSkill(registry: SkillRegistry, id: string) {
  return Effect.gen(function* () {
    const { data } = yield* registry.list();
    if (data.some(skill => skill.id === id && virtual(skill))) {
      return yield* Effect.fail(new Tool.Error({ message: `Virtual skill '${id}' is disabled. Use a file-backed skill.` }));
    }
  });
}
