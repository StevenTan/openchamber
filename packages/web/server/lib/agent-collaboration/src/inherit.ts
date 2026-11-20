import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { OpenCodeClient, SessionMessageInfo } from "@opencode/client";

export interface InheritanceClient {
  session: Pick<OpenCodeClient["session"], "get" | "remove">;
  message: Pick<OpenCodeClient["message"], "list">;
  experimental: { session: Pick<OpenCodeClient["experimental"]["session"], "import" | "instructions"> };
}

export async function inheritContext(
  api: InheritanceClient,
  input: { sessionID: string; messageID: string; callID: string; title: string },
  signal: AbortSignal,
) {
  const parent = await api.session.get({ sessionID: input.sessionID }, { signal });
  const messages: SessionMessageInfo[] = [];
  let cursor: string | undefined;
  let boundary = false;
  do {
    const page = await api.message.list({
      sessionID: input.sessionID, limit: 200, ...(cursor ? { cursor } : { order: "asc" }),
    }, { signal });
    for (const message of page.data) {
      if (message.id === input.messageID) {
        if (message.type !== "assistant") throw new Error("Subagent context boundary is not an assistant message.");
        const index = message.content.findIndex(part => part.type === "tool" && part.id === input.callID);
        if (index < 0) throw new Error("Subagent context tool call was not found.");
        const content = message.content.slice(0, index).filter(part =>
          part.type !== "tool" || part.state.status === "completed" || part.state.status === "error",
        );
        if (content.length > 0) {
          // Imports require settled assistant messages; only the copied prefix is closed.
          messages.push({
            id: message.id, type: "assistant", agent: message.agent, model: message.model,
            content, time: { created: message.time.created, completed: Date.now() },
          });
        }
        boundary = true;
        break;
      }
      if (message.type === "assistant" && message.time.completed === undefined) continue;
      if ((message.type === "shell" || message.type === "compaction") && message.status === "running") continue;
      messages.push(message);
    }
    cursor = page.cursor.next ?? undefined;
  } while (!boundary && cursor);
  if (!boundary) throw new Error("Subagent context boundary was not found.");
  const entries = await api.experimental.session.instructions.entry.list({ sessionID: input.sessionID }, { signal });
  const ids = new Map(messages.map(message => [message.id, `msg_${randomUUID().replaceAll("-", "")}`]));
  const copies = messages.map(message => {
    const copy = { ...message, id: ids.get(message.id) };
    if (message.type === "compaction" && message.status === "completed" && message.metadata?.keepID) {
      const keepID = ids.get(z.string().parse(message.metadata.keepID));
      if (!keepID) throw new Error("Compaction references a message outside the inherited context.");
      return z.json().parse({ ...copy, metadata: { ...message.metadata, keepID } });
    }
    return z.json().parse(copy);
  });
  signal.throwIfAborted();
  const sessionID = `ses_${randomUUID().replaceAll("-", "")}`;
  const now = Date.now();
  let info: Parameters<InheritanceClient["experimental"]["session"]["import"]>[0]["info"] = {
    id: sessionID, parentID: parent.id, projectID: parent.projectID,
    title: input.title, location: parent.location,
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: now, updated: now },
  };
  if (parent.model !== undefined) info = { ...info, model: parent.model };
  if (parent.metadata !== undefined) info = { ...info, metadata: parent.metadata };
  if (parent.permissions !== undefined) info = { ...info, permissions: parent.permissions };
  await api.experimental.session.import({
    location: parent.location,
    info,
    messages: copies,
  });
  try {
    for (const entry of entries) {
      signal.throwIfAborted();
      await api.experimental.session.instructions.entry.put({ sessionID, key: entry.key, value: entry.value });
    }
    signal.throwIfAborted();
    return sessionID;
  } catch (error) {
    await api.session.remove({ sessionID });
    throw error;
  }
}
