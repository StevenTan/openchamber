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

interface Followup {
  agent: string;
  description: string;
  prompt: string;
  sessionID: string;
  background: true;
}

interface Registration<Input> {
  name: string;
  description: string;
  options: { namespace: string; codemode: false; permission: string };
  input: z.core.JSONSchema.JSONSchema;
  execute(input: Input, context: Invocation): Promise<{ content?: string | readonly Tool.Content[]; metadata?: Tool.Metadata }>;
}

interface PluginContext {
  session: Pick<SessionApi, "get" | "interrupt">;
  permission: { assert(request: {
    sessionID: string; agent: string; action: string; resources: string[]; save: string[];
    source: { type: "tool"; messageID: string; id: string };
  }): Promise<void> };
  tool: { transform(fn: (editor: {
    get(name: "subagent"): { execute(input: Followup, context: Invocation): Promise<{ content: string; metadata?: Tool.Metadata }> } | undefined;
    namespace(value: { name: string; description: string }): void;
    add<Input>(tool: Registration<Input>): void;
  }) => void): Promise<void> };
}

const target = z.string().min(1).describe("Child session ID returned by subagent.");
const sendInput = z.object({ target, message: z.string().min(1).describe("Follow-up instructions for the subagent.") }).strict();
const interruptInput = z.object({ target }).strict();
const waitResult = z.object({ session_id: z.string(), status: z.literal("idle"), output: z.string(), error: z.json().optional() });
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
          const result = await subagent.execute({
            agent: child.agent, description: child.title ?? args.target,
            prompt: args.message, sessionID: args.target, background: true,
          }, { ...context, signal });
          return { content: result.content, metadata: result.metadata };
        },
      });
      editor.add<z.infer<typeof waitInput>>({
        name: "wait_agent",
        description: "Wait for any of the specified child agents to become idle, returning that child's latest assistant text and any error. Idle includes completion, failure and interruption; it does not imply success. Timeout returns timed_out=true. Cancellation or timeout ends only the wait and leaves the agents running. Background completion notifications remain active.",
        options: { namespace: "collaboration", codemode: false, permission: "subagent" },
        input: z.toJSONSchema(waitInput, { io: "input" }),
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
            return { content: JSON.stringify({ timed_out: result === null, result }) };
          } finally {
            clearTimeout(timer);
            waiting.abort();
          }
        },
      });
      editor.add<z.infer<typeof interruptInput>>({
        name: "interrupt_agent",
        description: "Interrupt an existing child agent without deleting its session. Returns whether interruption was accepted; cleanup settles asynchronously. Use wait_agent to wait for idle, or send_input to give the child another task.",
        options: { namespace: "collaboration", codemode: false, permission: "subagent" },
        input: z.toJSONSchema(interruptInput),
        async execute(input, context) {
          const args = interruptInput.parse(input);
          const signal = AbortSignal.any([context.signal, lifetime.signal]);
          const child = await ownedChild(args.target, context, signal);
          await approve(child.agent, context);
          signal.throwIfAborted();
          const result = await ctx.session.interrupt({ sessionID: args.target, resume: false }, { signal });
          return { content: JSON.stringify({ session_id: args.target, ...result }) };
        },
      });
    });
    return () => lifetime.abort();
  },
};
