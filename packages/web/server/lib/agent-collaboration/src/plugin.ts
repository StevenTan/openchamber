import { z } from "zod";
import type { SessionApi } from "@opencode/client/promise/api";
import type { Tool } from "@opencode/schema/tool";

interface Invocation {
  sessionID: string;
  agent: string;
  messageID: string;
  id: string;
  signal: AbortSignal;
  progress(update: Tool.Metadata): Promise<void>;
}

type SubagentInput = z.input<typeof subagentInput>;

interface NativeSubagent {
  description: string;
  input: z.core.JSONSchema.JSONSchema;
  execute(input: SubagentInput, context: Invocation): Promise<{ content: string; metadata?: Tool.Metadata }>;
}

interface Registration<Input, Output = never> {
  name: string;
  description: string;
  options: { namespace: string; codemode: false; permission: string };
  input: z.core.JSONSchema.JSONSchema;
  execute(input: Input, context: Invocation): Promise<{ content?: string | readonly Tool.Content[]; metadata?: Tool.Metadata; output?: Output }>;
  output?: z.core.JSONSchema.JSONSchema;
}

interface PluginContext {
  session: Pick<SessionApi, "get" | "interrupt" | "remove">;
  permission: { assert(request: {
    sessionID: string; agent: string; action: string; resources: string[]; save: string[];
    source: { type: "tool"; messageID: string; id: string };
  }): Promise<void> };
  tool: { transform(fn: (editor: {
    get(name: "subagent"): NativeSubagent | undefined;
    update(name: "subagent", update: (tool: NativeSubagent) => void): void;
    namespace(value: { name: string; description: string }): void;
    add<Input, Output = never>(tool: Registration<Input, Output>): void;
  }) => void): Promise<void> };
}

const target = z.string().min(1).describe("Child session ID returned by subagent.");
const sendInput = z.object({ target, message: z.string().min(1).describe("Follow-up instructions for the subagent.") }).strict();
const interruptInput = z.object({ target }).strict();
const waitResult = z.object({ session_id: z.string(), status: z.literal("idle"), output: z.string(), error: z.json().optional() });
const waitOutput = z.discriminatedUnion("timed_out", [
  z.object({ timed_out: z.literal(true), result: z.null() }),
  z.object({ timed_out: z.literal(false), result: waitResult }),
]);
const interruptOutput = z.object({ session_id: z.string(), interrupted: z.boolean() });
const waitInput = z.object({
  targets: z.array(target).min(1).describe("Child session IDs. Returns when any target becomes idle."),
  timeout_ms: z.number().int().min(10000).max(3600000).default(30000).describe("Wait timeout in milliseconds. Defaults to 30000, range 10000–3600000. Prefer a longer wait over repeated polling."),
}).strict();
const subagentInput = z.object({
  agent: z.string().describe("The type of specialized agent to use for this task. If the user asks for a subagent by a name that is not one of the available subagents, they most likely mean a model: pick a suitable agent and pass the name through the model parameter instead."),
  description: z.string().describe("A short 3-5 word label for the task, displayed to the user"),
  prompt: z.string().describe("The task for the subagent to perform"),
  model: z.string().optional().describe("NEVER set this unless the user explicitly asks for a particular model or variant. It must be a chat model; image and decision models can't run subagents. Use providerID/modelID or providerID/modelID#variant. Do not guess the ID: look the model up with the models tool, filtering to your own provider first."),
  sessionID: z.string().startsWith("ses").optional().describe("Send a follow-up to an existing subagent, running or finished. Omit to start a new one."),
  background: z.boolean().optional().describe("Run the subagent in the background and return immediately. You will be notified when it completes. DO NOT sleep, poll, or proactively check on its progress."),
  fork_turns: z.enum(["all", "none"]).default("all").describe("Parent history to inherit. Defaults to all; use none to start without parent history. Only all and none are supported. Applies when creating a new child."),
}).strict();

export default {
  id: "openchamber-collaboration-tool",
  async setup(ctx: PluginContext) {
    const lifetime = new AbortController();
    const endpoint = new URL("/api/openchamber/subagent-wait", process.env.OPENCHAMBER_AGENT_TOOL_URL);
    const host = endpoint.hostname.replace(/^\[|\]$/g, "");
    for (const key of ["NO_PROXY", "no_proxy"]) {
      const entries = (process.env[key] || "").split(",").map(value => value.trim()).filter(Boolean);
      if (!entries.includes(host)) process.env[key] = [...entries, host].join(",");
    }
    const ownedChild = async (id: string, context: Invocation, signal: AbortSignal) => {
      signal.throwIfAborted();
      const child = await ctx.session.get({ sessionID: id }, { signal });
      signal.throwIfAborted();
      if (child.parentID !== context.sessionID) throw new Error("Target is not a child of the current session.");
      if (child.agent === undefined) throw new Error("Target has no assigned subagent.");
      return { ...child, agent: child.agent };
    };
    const approve = (agent: string, context: Invocation) =>
      ctx.permission.assert({
        sessionID: context.sessionID, agent: context.agent, action: "subagent",
        resources: [agent], save: [agent],
        source: { type: "tool", messageID: context.messageID, id: context.id },
      });

    await ctx.tool.transform(editor => {
      const subagent = editor.get("subagent");
      if (!subagent) return;
      const executeSubagent = subagent.execute;
      editor.update("subagent", tool => {
        tool.description = [
          "Spawns an agent in a child session to work on a specific task.",
          "fork_turns defaults to all, inheriting the parent's recorded conversation before this call, including text from the current assistant message, completed tool results, attachments and session instructions. Use none for a fresh conversation. The child's own agent instructions apply in both modes.",
          "Pass sessionID to continue an existing child without copying history again.",
          "Foreground (default) returns its final response. Background mode returns immediately and delivers a completion notification.",
        ].join("\n");
        tool.input = z.toJSONSchema(subagentInput, { io: "input" });
        tool.execute = async (input, context) => {
          const { fork_turns, ...args } = subagentInput.parse(input);
          if (args.sessionID || fork_turns === "none") return executeSubagent(args, context);
          const signal = AbortSignal.any([context.signal, lifetime.signal]);
          signal.throwIfAborted();
          // Preparation settles its writes and rollback before cancellation is reported.
          const response = await fetch(new URL("/api/openchamber/subagent-context", endpoint), {
            method: "POST",
            headers: { authorization: `Bearer ${process.env.OPENCHAMBER_AGENT_TOOL_TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ sessionID: context.sessionID, messageID: context.messageID, callID: context.id, title: args.description }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(result).error);
          const { sessionID } = z.object({ sessionID: z.string() }).parse(result);
          let admitted = false;
          try {
            signal.throwIfAborted();
            return await executeSubagent({ ...args, sessionID, prompt: `You are a subagent spawned by another session.\n${args.prompt}` }, {
              ...context, signal,
              async progress(update) { await context.progress(update); admitted = true; },
            });
          } catch (error) {
            if (!admitted) await ctx.session.remove({ sessionID });
            throw error;
          }
        };
      });
      editor.namespace({ name: "collaboration", description: "Tools for coordinating existing child agents." });
      editor.add<z.infer<typeof sendInput>>({
        name: "send_input",
        description: "Send follow-up instructions to an existing child agent. Returns immediately; wakes an idle child or steers a running child at its next boundary. Completion is delivered through the normal subagent notification. Use subagent to start a new child.",
        options: { namespace: "collaboration", codemode: false, permission: "subagent" },
        input: z.toJSONSchema(sendInput),
        async execute(input, context) {
          const args = sendInput.parse(input);
          const signal = AbortSignal.any([context.signal, lifetime.signal]);
          const child = await ownedChild(args.target, context, signal);
          const result = await executeSubagent({
            agent: child.agent, description: child.title ?? args.target,
            prompt: args.message, sessionID: args.target, background: true,
          }, { ...context, signal });
          return { content: result.content, metadata: result.metadata };
        },
      });
      editor.add<z.infer<typeof waitInput>, z.infer<typeof waitOutput>>({
        name: "wait_agent",
        description: "Wait for any of the specified child agents to become idle. Returns an object with timed_out and result; result contains the child's session_id, idle status, latest assistant text in output, and any error. Idle includes completion, failure and interruption; it does not imply success. Timeout returns timed_out=true and result=null. Cancellation or timeout ends only the wait and leaves the agents running. Background completion notifications remain active.",
        options: { namespace: "collaboration", codemode: false, permission: "subagent" },
        input: z.toJSONSchema(waitInput, { io: "input" }),
        output: z.toJSONSchema(waitOutput),
        async execute(input, context) {
          const args = waitInput.parse(input);
          const waiting = new AbortController();
          const signal = AbortSignal.any([context.signal, lifetime.signal, waiting.signal]);
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const children = await Promise.all(args.targets.map(id => ownedChild(id, context, signal)));
            await Promise.all(children.map(child => approve(child.agent, context)));
            signal.throwIfAborted();
            const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), args.timeout_ms); });
            const result = await Promise.race([
              timeout,
              ...args.targets.map(async id => {
                const request: RequestInit & { timeout: false } = {
                  method: "POST",
                  headers: { authorization: `Bearer ${process.env.OPENCHAMBER_AGENT_TOOL_TOKEN}`, "content-type": "application/json" },
                  body: JSON.stringify({ sessionID: context.sessionID, target: id }),
                  signal,
                  timeout: false,
                };
                const response = await fetch(endpoint, request);
                const result = await response.json();
                if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(result).error);
                return waitResult.parse(result);
              }),
            ]);
            const output: z.infer<typeof waitOutput> = result === null
              ? { timed_out: true, result: null }
              : { timed_out: false, result };
            return { output, content: JSON.stringify(output) };
          } finally {
            clearTimeout(timer);
            waiting.abort();
          }
        },
      });
      editor.add<z.infer<typeof interruptInput>, z.infer<typeof interruptOutput>>({
        name: "interrupt_agent",
        description: "Interrupt an existing child agent without deleting its session. Returns an object with session_id and interrupted, indicating whether interruption was accepted; cleanup settles asynchronously. Use wait_agent to wait for idle, or send_input to give the child another task.",
        options: { namespace: "collaboration", codemode: false, permission: "subagent" },
        input: z.toJSONSchema(interruptInput),
        output: z.toJSONSchema(interruptOutput),
        async execute(input, context) {
          const args = interruptInput.parse(input);
          const signal = AbortSignal.any([context.signal, lifetime.signal]);
          const child = await ownedChild(args.target, context, signal);
          await approve(child.agent, context);
          signal.throwIfAborted();
          const result = await ctx.session.interrupt({ sessionID: args.target, resume: false }, { signal });
          const output = { session_id: args.target, interrupted: result.interrupted };
          return { output, content: JSON.stringify(output) };
        },
      });
    });
    return () => lifetime.abort();
  },
};
