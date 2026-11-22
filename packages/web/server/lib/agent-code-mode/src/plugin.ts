import { Effect, Option, Schema, type Types } from "effect";
import type { AgentApi, SessionApi } from "@opencode/client/effect/api";
import type { Agent } from "@opencode/schema/agent";
import type { Session } from "@opencode/schema/session";
import { Tool } from "@opencode/schema/tool";
import type { Permission } from "@opencode/schema/permission";
import { scriptRuntime, scriptOutput, type ScriptTool } from "./execution.js";
import { FILE_MCP_TOOLS } from "../../agent-file/contracts.js";
import { assertFileSkill, filterVirtualSkillGuidance, type SkillRegistry } from "./skill-policy.js";
import { BROWSER_MCP_TOOLS } from "../../browser-control/tools.js";
import { CONTROL_MCP_TOOLS } from "../../agent-tool/control-mcp.js";
import { fetchExtension } from "./fetch.js";
import { definition, execute, normalizedName } from "./vendor/tool-runtime.js";
import { Wildcard } from "./vendor/wildcard.js";

const directTools = new Set([
  "openchamber_render", "openchamber_secret", "openchamber_image",
  "openchamber_workflow", "openchamber_workflow_answer",
  "subagent",
  "openchamber_commands_exec_command", "openchamber_commands_write_stdin",
  "openchamber_commands_clock_sleep", "openchamber_commands_store", "openchamber_commands_load",
  ...BROWSER_MCP_TOOLS,
  "request_user_input_async",
  ...FILE_MCP_TOOLS,
  ...CONTROL_MCP_TOOLS,
]);
const cardTools = new Set(["openchamber_render", "openchamber_secret", "openchamber_image", "openchamber_workflow", "openchamber_workflow_answer", "subagent"]);
const executeName = "openchamber_execute";
const skillInput = Schema.Struct({ id: Schema.String });

type Registration = Tool.Info & { id: string };
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
  permission: { assert(input: { sessionID: Session.ID; agent: Agent.ID; action: string; resources: string[]; save: string[]; metadata: { method: string; url: string }; source: { type: "tool"; messageID: Tool.Context["messageID"]; id: string } }): Effect.Effect<void, Tool.Error> };
  skill: SkillRegistry;
  session: Pick<SessionApi, "get"> & { hook(name: "context" | "compaction" | "generate", run: (event: Request) => Effect.Effect<void>): Effect.Effect<unknown> };
  tool: {
    list(): Effect.Effect<readonly Registration[]>;
    transform(run: (editor: {
      list(): readonly Registration[];
      add(tool: Tool.Info): void;
      update(id: string, change: (tool: Types.Mutable<Pick<Tool.Info, "options" | "execute" | "description" | "input">>) => void): void;
    }) => void): Effect.Effect<unknown>;
    hook(name: "execute.before", run: (event: ToolEvent & { input: unknown }) => Effect.Effect<void, Tool.Error>): Effect.Effect<unknown>;
  };
}

function disabled(action: string, rules: Permission.Ruleset) {
  const rule = rules.findLast(rule => Wildcard.match(action, rule.action));
  return rule?.resource === "*" && rule.effect === "deny";
}

function scriptTools(tools: readonly Registration[], invoke: (tool: Registration, input: Schema.Json) => ReturnType<ScriptTool["execute"]>): ScriptTool[] {
  return tools.map(tool => {
    const name = normalizedName(tool);
    const path = tool.options?.namespace === undefined ? name : `${tool.options.namespace}.${name}`;
    const child = definition(tool);
    return { id: tool.id, path,
      description: tool.description,
      input: child.inputSchema,
      output: child.outputSchema ?? Schema.NullOr(Schema.String),
      execute: (input: Schema.Json) => invoke(tool, input),
    };
  });
}

function completeCatalog(tools: readonly ScriptTool[], direct: ReadonlySet<string>) {
  const { catalog } = scriptRuntime(tools, () => Effect.void);
  const directNames = new Map(tools.filter(tool => direct.has(tool.id)).map(tool => [tool.path, tool.id]));
  return [
    "# Code Mode",
    "Call the tools below as JavaScript inside `openchamber_execute` with { code }. This complete catalog supplies every available path, description and parameter signature; call these paths directly without a tool-discovery step.",
    "A direct tool entry accepts JSON arguments as its own tool call. Inside JavaScript, use the exact tools path in the signature below. Each supported direct entry is named beside its script signature; both forms accept the same arguments.",
    "Await calls whose results matter. Run independent calls concurrently with Promise.allSettled; run dependent operations in order. Return the results the model needs.",
    ...catalog.map(tool => {
      const directName = directNames.get(tool.path);
      return `## ${tool.path}\n\n${tool.description}${directName ? `\n\nDirect tool entry: \`${directName}\`. JavaScript call:` : ""}\n\n\`\`\`typescript\n${tool.signature}\n\`\`\``;
    }),
  ].join("\n\n");
}

export default {
  id: "openchamber-code-mode",
  effect: (ctx: PluginContext) => Effect.gen(function* () {
    const available = (registered: readonly Registration[], rules: Permission.Ruleset) => registered.filter(tool =>
      tool.id !== executeName && !cardTools.has(tool.id) && !disabled(tool.options?.permission ?? tool.id, rules));
    yield* ctx.tool.transform(editor => {
      for (const tool of editor.list()) {
        editor.update(tool.id, value => {
          const { pinned: _pinned, ...options } = value.options ?? {};
          value.options = { ...options, codemode: false };
        });
      }
      editor.add({ name: executeName, options: { codemode: false, permission: "execute" },
        description: "Run JavaScript to call tools from the complete Code Mode catalog. Pass { code }. Await calls whose results matter; use Promise.allSettled for independent calls. Return the results needed for reasoning. Pending calls stop when the script ends. Command and file tools also have direct entries. fetch(url, init?) returns a response with text(), json(), bytes(), status, ok, url and headers; it uses webfetch permissions.",
        input: Schema.Struct({ code: Schema.String }), output: Schema.Json,
        execute: (input, context) => Effect.gen(function* () {
          const { code } = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(input);
          const [registered, session, agent] = yield* Effect.all([
            ctx.tool.list(), ctx.session.get({ sessionID: context.sessionID }), ctx.agent.get({ agentID: context.agent }),
          ], { concurrency: "unbounded" });
          const rules = [...agent.data.permissions, ...session.permissions ?? []];
          const tools = scriptTools(available(registered, rules), (tool, input) => Effect.gen(function* () {
            if (tool.id === "skill") {
              const { id } = yield* Schema.decodeUnknownEffect(skillInput)(input);
              yield* assertFileSkill(ctx.skill, id);
            }
            let metadata: Tool.Metadata = {};
            const result = yield* execute(tool, input, { ...context, progress: value => Effect.sync(() => { metadata = { ...metadata, ...value }; }) });
            const content = result.content;
            const text = content.filter(part => part.type === "text").map(part => part.text).join("\n");
            return { value: yield* Schema.decodeUnknownEffect(Schema.Json)(result.output === undefined ? text || null : result.output),
              text, metadata: yield* Schema.decodeUnknownEffect(Schema.JsonObject)(JSON.parse(JSON.stringify({ ...metadata, ...result.metadata }))),
              files: content.filter(part => part.type === "file"),
            };
          }));
          const network = fetchExtension((url, metadata) => ctx.permission.assert({
            sessionID: context.sessionID, agent: context.agent, action: "webfetch", resources: [url], save: ["*"], metadata,
            source: { type: "tool", messageID: context.messageID, id: context.id },
          }), url => {
            const rule = rules.findLast(rule => Wildcard.match("webfetch", rule.action) && Wildcard.match(url, rule.resource));
            return rule?.effect === "deny" ? Effect.fail(new Error(`Permission denied: webfetch ${url}`)) : Effect.void;
          });
          const { result, calls, files } = yield* scriptRuntime(tools, calls => context.progress({ toolCalls: calls }), [network]).execute(code);
          const output = scriptOutput(result);
          return { output: yield* Schema.decodeUnknownEffect(Schema.Json)(result),
            content: [{ type: "text" as const, text: output }, ...files],
            metadata: { toolCalls: calls, openchamberToolCalls: calls },
          };
        }).pipe(Effect.mapError(error => new Tool.Error({ message: String(error) }))),
      });
    });
    yield* ctx.tool.hook("execute.before", event => Effect.gen(function* () {
      if (event.tool === "skill") {
        const decoded = Schema.decodeUnknownOption(skillInput)(event.input);
        if (Option.isSome(decoded)) yield* assertFileSkill(ctx.skill, decoded.value.id);
      }
    }));
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
      delete event.tools.execute;
      if (!event.tools[executeName]) return;
      const tools = available(registered, rules);
      for (const part of event.system) {
        const sources = part.metadata?.experimental?.instructions;
        if (!sources?.some(source => source.key === "core/codemode")) continue;
        part.metadata = { ...part.metadata, experimental: { ...part.metadata?.experimental,
          instructions: sources.filter(source => source.key !== "core/codemode"),
        } };
        part.text = sources.filter(source => source.key !== "core/codemode").map(source => source.text).join("\n\n");
      }
      for (const tool of registered) if (tool.id !== executeName && !directTools.has(tool.id)) delete event.tools[tool.id];
      const direct = Object.keys(event.tools).filter(name => name !== executeName);
      const text = completeCatalog(scriptTools(tools, () => Effect.die("Catalog only")), new Set(direct));
      event.system.push({ type: "text", text: text + (direct.length ? `\n\nDirect tools: ${direct.join(", ")}. Call these through their own tool entries.` : "") });
      event.messages.push({ role: "system", content: [{ type: "text", text:
        "Use the complete Code Mode catalog in this request's system instructions for current tool availability and parameter signatures; it supersedes historical Code Mode catalog notices.",
      }] });
    }));
  }),
};
