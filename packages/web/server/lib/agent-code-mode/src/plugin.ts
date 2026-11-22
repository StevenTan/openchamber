import { CodeMode, Tool as CatalogTool } from "@opencode/codemode";
import { Effect, Option, Predicate, Schema, Stream, type Types } from "effect";
import { z } from "zod";
import { $ZodType, toJSONSchema } from "zod/v4/core";
import type { AgentApi, SessionApi } from "@opencode/client/effect/api";
import type { Agent } from "@opencode/schema/agent";
import type { Session } from "@opencode/schema/session";
import type { Tool } from "@opencode/schema/tool";
import type { Permission } from "@opencode/schema/permission";
import { createCallActivity } from "./call-activity.js";
import { FILE_MCP_TOOLS } from "../../agent-file/contracts.js";
import { assertFileSkill, filterVirtualSkillGuidance, type SkillRegistry } from "./skill-policy.js";
import { BROWSER_MCP_TOOLS } from "../../browser-control/tools.js";

const directTools = new Set([
  "openchamber_render", "openchamber_secret", "openchamber_image",
  "openchamber_workflow", "openchamber_workflow_answer",
  "subagent",
  "openchamber_commands_exec_command", "openchamber_commands_write_stdin",
  "openchamber_commands_clock_sleep", "openchamber_commands_store", "openchamber_commands_load",
  ...BROWSER_MCP_TOOLS,
  "request_user_input_async",
  ...FILE_MCP_TOOLS,
]);
const skillInput = Schema.Struct({ id: Schema.String });

type Registration = Pick<Tool.Info, "name" | "description" | "input" | "output" | "options"> & { id: string };
interface InstructionSource { key: string; text: string }
interface SystemPart {
  type: "text";
  text: string;
  metadata?: { experimental?: { instructions?: InstructionSource[] } };
}
type ToolEvent = Pick<Tool.Context, "sessionID" | "messageID" | "id"> & { tool: string };
interface Request {
  sessionID: Session.ID;
  agent: Agent.ID;
  system: SystemPart[];
  tools: Record<string, { description: string }>;
  messages: Array<{ role: string; content: unknown[] }>;
}
interface PluginContext {
  agent: Pick<AgentApi, "get">;
  skill: SkillRegistry;
  session: Pick<SessionApi, "get"> & { hook(name: "context" | "compaction" | "generate", run: (event: Request) => Effect.Effect<void>): Effect.Effect<unknown> };
  tool: {
    list(): Effect.Effect<readonly Registration[]>;
    transform(run: (editor: {
      list(): readonly Registration[];
      update(id: string, change: (tool: Types.Mutable<Pick<Tool.Info, "options" | "execute" | "description" | "input">>) => void): void;
    }) => void): Effect.Effect<unknown>;
    hook(name: "execute.before", run: (event: ToolEvent & { input: unknown }) => Effect.Effect<void, Tool.Error>): Effect.Effect<unknown>;
    hook(name: "execute.after", run: (event: ToolEvent & (
      { status: "completed"; input: unknown; result: { content?: Tool.Result["content"]; metadata?: Tool.Metadata } } | { status: "error"; error: { metadata?: Tool.Metadata } }
    )) => Effect.Effect<void>): Effect.Effect<unknown>;
  };
  event: { subscribe(input: { types: string[] }): Stream.Stream<{ data: { sessionID: string } }, unknown> };
}

function disabled(action: string, rules: Permission.Ruleset) {
  const rule = [...rules].reverse().find(rule => {
    const pattern = rule.action.replaceAll("\\", "/").replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${pattern}$`, process.platform === "win32" ? "si" : "s").test(action.replaceAll("\\", "/"));
  });
  return rule?.resource === "*" && rule.effect === "deny";
}

function catalogSchema(value: Tool.Info["input"], io: "input" | "output"): CatalogTool.SchemaType {
  if (Schema.isSchema(value)) return Schema.toJsonSchemaDocument(value).schema;
  const convert = z.custom<(options: { target: string }) => z.core.JSONSchema.JSONSchema>(Predicate.isFunction);
  const standard = z.object({ "~standard": z.object({ jsonSchema: z.object({ input: convert, output: convert }) }) });
  const document = value instanceof $ZodType ? toJSONSchema(value, { target: "draft-2020-12", io })
    : "~standard" in value ? standard.parse(value)["~standard"].jsonSchema[io]({ target: "draft-2020-12" }) : value;
  return z.record(z.string(), z.unknown()).parse(document);
}

function completeCatalog(tools: readonly Registration[]) {
  const definitions = Object.fromEntries(tools.map(tool => {
    const name = tool.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = tool.options?.namespace === undefined ? name : `${tool.options.namespace}.${name}`;
    return [path, CatalogTool.make({
      description: tool.description,
      input: catalogSchema(tool.input, "input"),
      output: tool.output === undefined ? Schema.NullOr(Schema.String) : catalogSchema(tool.output, "output"),
      execute: () => Effect.void,
    })];
  }));
  const catalog = CodeMode.make({ tools: definitions }).catalog;
  return [
    "# Code Mode",
    "Call the tools below as JavaScript inside `execute`. This complete catalog defines tool availability for the current request.",
    "Await calls whose results matter. Run independent calls concurrently with Promise.allSettled; run dependent operations in order. Return the results the model needs.",
    ...catalog.map(tool => `## ${tool.path}\n\n${tool.description}\n\n\`\`\`typescript\n${tool.signature}\n\`\`\``),
  ].join("\n\n");
}

export default {
  id: "openchamber-code-mode",
  effect: (ctx: PluginContext) => Effect.gen(function* () {
    const activity = createCallActivity();
    yield* ctx.tool.transform(editor => {
      for (const tool of editor.list()) {
        if (directTools.has(tool.id)) continue;
        editor.update(tool.id, value => {
          value.options = { ...value.options, codemode: true, pinned: true };
          value.execute = activity.wrap(tool.id, value.execute);
        });
      }
    });
    yield* ctx.tool.hook("execute.before", event => Effect.gen(function* () {
      if (event.tool === "skill") {
        const decoded = Schema.decodeUnknownOption(skillInput)(event.input);
        if (Option.isSome(decoded)) yield* assertFileSkill(ctx.skill, decoded.value.id);
      }
      if (event.tool === "execute") activity.start(event);
    }));
    yield* ctx.tool.hook("execute.after", event => Effect.sync(() => {
      if (event.tool !== "execute") {
        if (event.status === "completed") activity.complete(event, event.input, event.result);
        return;
      }
      const calls = activity.finish(event);
      const result = event.status === "completed" ? event.result : event.error;
      if (calls?.length) result.metadata = { ...result.metadata, openchamberToolCalls: calls };
    }));
    yield* ctx.event.subscribe({ types: ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted", "session.deleted"] }).pipe(
      Stream.runForEach(event => Effect.sync(() => activity.clear(event.data.sessionID))),
      Effect.forkScoped({ startImmediately: true }),
    );
    for (const name of ["context", "compaction", "generate"] as const) yield* ctx.session.hook(name, event => Effect.gen(function* () {
      const [registered, session, agent, skills] = yield* Effect.all([
        ctx.tool.list(), ctx.session.get({ sessionID: event.sessionID }), ctx.agent.get({ agentID: event.agent }), ctx.skill.list(),
      ], { concurrency: "unbounded" });
      const rules = [...agent.data.permissions, ...(session.permissions ?? [])];
      filterVirtualSkillGuidance(event.system, skills.data, rules);
      if (skills.data.some(skill => skill.path.startsWith("skill://"))) {
        event.messages.push({ role: "system", content: [{ type: "text", text:
          "Use the current system skill directory for available skills; it supersedes historical skill catalog notices. Only file-backed skills are available through the skill tool.",
        }] });
      }
      if (!event.tools.execute) return;
      const tools = registered.filter(tool => tool.options?.codemode !== false
        && !disabled(tool.options?.permission ?? tool.id, rules));
      const text = completeCatalog(tools);
      for (const part of event.system) {
        const sources = part.metadata?.experimental?.instructions;
        if (!sources?.some(source => source.key === "core/codemode")) continue;
        part.metadata = { ...part.metadata, experimental: { ...part.metadata?.experimental,
          instructions: sources.filter(source => source.key !== "core/codemode"),
        } };
        part.text = sources.filter(source => source.key !== "core/codemode").map(source => source.text).join("\n\n");
      }
      const direct = Object.keys(event.tools).filter(name => name !== "execute");
      event.system.push({ type: "text", text: text + (direct.length ? `\n\nDirect tools: ${direct.join(", ")}. Call these through their own tool entries.` : "") });
      event.messages.push({ role: "system", content: [{ type: "text", text:
        "Use the complete Code Mode catalog in this request's system instructions for current tool availability and parameter signatures; it supersedes historical Code Mode catalog notices.",
      }] });
    }));
  }),
};
