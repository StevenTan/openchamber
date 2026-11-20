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

interface NativeSubagent {
  execute(input: { agent: string; description: string; prompt: string; sessionID: string }, context: Invocation): Promise<{ content: string; metadata?: Tool.Metadata }>;
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
  session: Pick<SessionApi, "get" | "interrupt">;
  permission: { assert(request: {
    sessionID: string; agent: string; action: string; resources: string[]; save: string[];
    source: { type: "tool"; messageID: string; id: string };
  }): Promise<void> };
  tool: { transform(fn: (editor: {
    get(name: "subagent"): NativeSubagent | undefined;
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
const listInput = z.object({}).strict();
const listOutput = z.object({ agents: z.array(z.object({
  session_id: z.string(), title: z.string().nullable(), agent: z.string(), status: z.enum(["running", "idle"]),
})) });
export type AgentList = z.infer<typeof listOutput>;
const waitInput = z.object({
  targets: z.array(target).min(1).describe("Child session IDs. Returns when any target becomes idle."),
  timeout_ms: z.number().int().min(10000).max(3600000).default(30000).describe("Wait timeout in milliseconds. Defaults to 30000, range 10000–3600000. Prefer a longer wait over repeated polling."),
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
            prompt: args.message, sessionID: args.target,
          }, { ...context, signal });
          const response: Awaited<ReturnType<NativeSubagent["execute"]>> = { content: result.content };
          if (result.metadata !== undefined) response.metadata = result.metadata;
          return response;
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
      editor.add<z.infer<typeof listInput>, z.infer<typeof listOutput>>({
        name: "list_agents",
        description: "List the current session's direct child agents. Returns an object with agents, each containing session_id, title, agent type and running or idle status. Idle includes completion, failure and interruption; it does not imply success. This is a snapshot, not detailed activity. Use wait_agent or background completion notifications to wait for results.",
        options: { namespace: "collaboration", codemode: false, permission: "subagent" },
        input: z.toJSONSchema(listInput),
        output: z.toJSONSchema(listOutput),
        async execute(input, context) {
          listInput.parse(input);
          const signal = AbortSignal.any([context.signal, lifetime.signal]);
          signal.throwIfAborted();
          const response = await fetch(new URL("/api/openchamber/subagent-list", endpoint), {
            method: "POST",
            headers: { authorization: `Bearer ${process.env.OPENCHAMBER_AGENT_TOOL_TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ sessionID: context.sessionID }), signal,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(result).error);
          const output = listOutput.parse(result);
          signal.throwIfAborted();
          await Promise.all([...new Set(output.agents.map(child => child.agent))].map(agent => approve(agent, context)));
          signal.throwIfAborted();
          return { output, content: JSON.stringify(output) };
        },
      });
    });
    return () => lifetime.abort();
  },
};
