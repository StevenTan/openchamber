import { z } from "zod";
import type { SessionApi } from "@opencode/client/promise/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { waitFetch } from "./wait-fetch.js";
import type { AgentList } from "./plugin.js";

const input = z.object({ sessionID: z.string().min(1), target: z.string().min(1) }).strict();
const listInput = z.object({ sessionID: z.string().min(1) }).strict();
type AssistantMessage = Extract<Awaited<ReturnType<SessionApi["context"]>>[number], { type: "assistant" }>;
type WaitResult = { session_id: string; status: "idle"; output: string; error?: AssistantMessage["error"] };
interface Request extends IncomingMessage { body: unknown }
interface Response extends ServerResponse {
  status(code: number): Response;
  json(value: WaitResult | { error: string } | AgentList): Response;
}
type Handler = (req: Request, res: Response) => Promise<Response | void>;
type Parser = (req: Request, res: Response, next: () => void) => void;
interface Dependencies {
  authorize(req: IncomingMessage): boolean;
  trackInflight(sessionID: string, controller: AbortController): () => void;
  client(requestFetch: typeof fetch): { session: Pick<SessionApi, "get" | "wait" | "context" | "list" | "active"> };
}

export function registerCollaborationRoutes(
  app: { post(path: string, parser: Parser, handler: Handler): void },
  express: { json(options: { limit: string }): Parser },
  { authorize, trackInflight, client }: Dependencies,
) {
  app.post("/api/openchamber/subagent-wait", express.json({ limit: "1mb" }), async (req, res) => {
    if (!authorize(req)) return res.status(401).json({ error: "Unauthorized" });
    const controller = new AbortController();
    const signal = controller.signal;
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.once("close", abort);
    try {
      const args = input.parse(req.body);
      const untrack = trackInflight(args.sessionID, controller);
      try {
        const api = client(waitFetch).session;
        const child = await api.get({ sessionID: args.target }, { signal });
        if (child.parentID !== args.sessionID) return res.status(403).json({ error: "Target is not a child of the current session." });
        await api.wait({ sessionID: args.target }, { signal });
        const messages = await api.context({ sessionID: args.target }, { signal });
        const assistant = messages.filter(message => message.type === "assistant").at(-1);
        const output = assistant?.content.flatMap(part => part.type === "text" ? [part.text] : []).join("\n\n") ?? "";
        return res.json({ session_id: args.target, status: "idle", output, error: assistant?.error });
      } finally {
        untrack();
      }
    } catch (error) {
      if (!res.destroyed) return res.status(error instanceof z.ZodError ? 400 : 500).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      res.off("close", abort);
    }
  });
  app.post("/api/openchamber/subagent-list", express.json({ limit: "1mb" }), async (req, res) => {
    if (!authorize(req)) return res.status(401).json({ error: "Unauthorized" });
    const controller = new AbortController();
    const signal = controller.signal;
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.once("close", abort);
    let untrack: (() => void) | undefined;
    try {
      const args = listInput.parse(req.body);
      untrack = trackInflight(args.sessionID, controller);
      const api = client(waitFetch).session;
      let page = await api.list({ parentID: args.sessionID }, { signal });
      const children = [...page.data];
      while (page.cursor.next != null) {
        page = await api.list({ parentID: args.sessionID, cursor: page.cursor.next }, { signal });
        children.push(...page.data);
      }
      const active = await api.active({ signal });
      const agents: AgentList["agents"] = children.flatMap(child => child.agent === undefined ? [] : [{
        session_id: child.id, title: child.title ?? null, agent: child.agent,
        status: child.id in active ? "running" : "idle",
      }]);
      return res.json({ agents });
    } catch (error) {
      if (!res.destroyed) return res.status(error instanceof z.ZodError ? 400 : 500).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      untrack?.();
      res.off("close", abort);
    }
  });
}
