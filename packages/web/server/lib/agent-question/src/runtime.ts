import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SessionApi } from "@opencode/client/promise/api";
import { createMessageId } from "../../dispatch-results/runtime.js";
import { createQuestionPluginSource, questionInput } from "./plugin.js";

const entrySchema = z.object({
  id: z.string().min(1),
  sessionID: z.string().min(1),
  callID: z.string().min(1),
  order: z.number().int().positive(),
  input: questionInput,
  resolution: z.discriminatedUnion("status", [
    z.object({ status: z.literal("pending") }),
    z.object({ status: z.literal("answered"), answer: z.record(z.string(), z.string()), messageID: z.string().min(1) }),
    z.object({ status: z.literal("cancelled"), messageID: z.string().min(1) }),
  ]),
});
type Entry = z.infer<typeof entrySchema>;
type ResolvedEntry = Omit<Entry, "resolution"> & { resolution: Exclude<Entry["resolution"], { status: "pending" }> };
type Answer = Record<string, string>;
const replySchema = z.discriminatedUnion("status", [
  z.object({ questionID: z.string().min(1), status: z.literal("answered"), answer: z.record(z.string(), z.string()) }),
  z.object({ questionID: z.string().min(1), status: z.literal("cancelled") }),
]);
const batchSchema = z.object({ sessionID: z.string().min(1), replies: z.array(replySchema).min(1) });
type BatchResolution = z.input<typeof batchSchema>;
interface QuestionRequest {
  sessionID: string;
  callID: string;
  input: z.input<typeof questionInput>;
}
interface EventHub {
  subscribeEvent(listener: (event: { payload: unknown }) => void): () => void;
  subscribeStatus(listener: (status: { type: string }) => void): () => void;
}
interface Dependencies {
  dataDir: string;
  client: (sessionID?: string) => { session: QuestionSessionApi };
  globalEventHub: EventHub;
  isSessionArchived(sessionID: string): Promise<boolean>;
  isEnabled(): boolean;
  retryMs?: number;
}
export interface QuestionSessionApi {
  get(input: { sessionID: string }, options?: { signal: AbortSignal }): Promise<void>;
  form: {
    get(input: { sessionID: string; formID: string }, options?: { signal: AbortSignal }): Promise<{ state: { status: string; answer?: Answer } }>;
    create(input: Parameters<SessionApi['form']['create']>[0], options?: { signal: AbortSignal }): Promise<void>;
    reply(input: Parameters<SessionApi['form']['reply']>[0], options?: { signal: AbortSignal }): Promise<void>;
    cancel(input: Parameters<SessionApi['form']['cancel']>[0], options?: { signal: AbortSignal }): Promise<void>;
  };
  synthetic(input: Parameters<SessionApi['synthetic']>[0], options?: { signal: AbortSignal }): Promise<void>;
}
export function createOpenCodeQuestionSession(api: Pick<SessionApi, 'get' | 'form' | 'synthetic'>): QuestionSessionApi {
  return {
    get: async (input, options) => { await api.get(input, options); },
    form: {
      async get(input, options) { const form = await api.form.get(input, options); return { state: { status: form.state.status, ...form.state.status === 'answered' && { answer: z.record(z.string(), z.string()).parse(form.state.answer) } } }; },
      create: async (input, options) => { await api.form.create(input, options); },
      reply: async (input, options) => { await api.form.reply(input, options); },
      cancel: async (input, options) => { await api.form.cancel(input, options); },
    },
    synthetic: async (input, options) => { await api.synthetic(input, options); },
  };
}
const settlementEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("form.replied"), data: z.object({ id: z.string(), sessionID: z.string(), answer: z.record(z.string(), z.string()) }) }),
  z.object({ type: z.literal("form.cancelled"), data: z.object({ id: z.string(), sessionID: z.string() }) }),
]);
const declaredStatuses = { FormNotFoundError: 404, SessionNotFoundError: 404, ConflictError: 409, FormAlreadySettledError: 409 };
const errorStatus = (cause: unknown) => {
  const declared = z.object({ _tag: z.enum(["FormNotFoundError", "SessionNotFoundError", "ConflictError", "FormAlreadySettledError"]) }).safeParse(cause);
  if (declared.success) return declaredStatuses[declared.data._tag];
  return z.object({ status: z.number() }).safeParse(cause).data?.status;
};
const usageError = (message: string) => Object.assign(new Error(message), { status: 400 });

export const questionStoreDirectory = (dataDir: string, runtime: string, host: string, port: number) => {
  const owner = createHash("sha256").update(JSON.stringify([runtime, host, port || { pid: process.pid }])).digest("hex");
  return path.join(dataDir, "async-questions", owner);
};

export function createQuestionRuntime({ dataDir, client, globalEventHub, isSessionArchived, isEnabled, retryMs = 2000 }: Dependencies) {
  const filename = path.join(dataDir, "async-questions.json");
  let entries = new Map<string, Entry>();
  let loaded = false;
  let stopped = false;
  let serial = Promise.resolve();
  let retry: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: Array<() => void> = [];

  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = serial.then(operation);
    serial = result.then(() => undefined, () => undefined);
    return result;
  };
  const load = async () => {
    if (loaded) return;
    try {
      const stored = z.array(entrySchema).parse(JSON.parse(await fs.readFile(filename, "utf8")));
      for (const entry of stored) entries.set(entry.id, entry);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    loaded = true;
  };
  const commit = async (updates: Entry[], removed: Entry[] = []) => {
    const next = new Map(entries);
    for (const entry of updates) next.set(entry.id, entry);
    for (const entry of removed) next.delete(entry.id);
    await fs.mkdir(dataDir, { recursive: true });
    const temporary = `${filename}.tmp-${process.pid}`;
    try {
      await fs.writeFile(temporary, JSON.stringify([...next.values()]), { mode: 0o600 });
      await fs.rename(temporary, filename);
      entries = next;
    } finally {
      await fs.rm(temporary, { force: true });
    }
  };
  const field = (question: Entry["input"]["questions"][number], index: number) => {
    const result = { key: `q${index}`, type: "string" as const, title: question.title, required: true, custom: true };
    if (question.options) return { ...result, options: question.options.map(value => ({ value, label: value })), default: question.options[0] };
    return result;
  };
  const formInput = (entry: Entry) => ({
    id: entry.id,
    sessionID: entry.sessionID,
    title: entry.input.questions[0].title,
    metadata: { kind: "openchamber-async-question", callID: entry.callID, order: entry.order },
    fields: [field(entry.input.questions[0], 0), ...entry.input.questions.slice(1).map((question, index) => field(question, index + 1))] satisfies Parameters<SessionApi["form"]["create"]>[0]["fields"],
  });
  const resolvedEntry = (entry: Entry, messageID: string, answer?: Answer): Entry => {
    if (entry.resolution.status !== "pending") {
      if (JSON.stringify(entry.resolution.status === "answered" ? entry.resolution.answer : undefined) !== JSON.stringify(answer)) {
        throw Object.assign(new Error("This question has already been settled."), { status: 409 });
      }
      return entry;
    }
    if (answer) {
      const keys = entry.input.questions.map((_, index) => `q${index}`);
      if (Object.keys(answer).length !== keys.length || keys.some(key => !Object.hasOwn(answer, key))) {
        throw usageError("Answer every question using its field key.");
      }
    }
    return { ...entry, resolution: answer ? { status: "answered", answer, messageID } : { status: "cancelled", messageID } };
  };
  const reconcileForm = async (entry: Entry) => {
    const api = client(entry.sessionID).session;
    const options = { signal: AbortSignal.timeout(15_000) };
    await api.get({ sessionID: entry.sessionID }, options);
    if (entry.resolution.status === "pending") {
      let detail;
      try { detail = await api.form.get({ sessionID: entry.sessionID, formID: entry.id }, options); }
      catch (error) {
        if (errorStatus(error) !== 404) throw error;
        await api.form.create(formInput(entry), options);
        return;
      }
      if (detail.state.status === "answered") {
        await commit([resolvedEntry(entry, createMessageId(Date.now()), z.record(z.string(), z.string()).parse(detail.state.answer))]);
      } else if (detail.state.status === "cancelled") await commit([resolvedEntry(entry, createMessageId(Date.now()))]);
    }
  };
  const deliver = async (group: [ResolvedEntry, ...ResolvedEntry[]]) => {
    const first = group[0];
    const resolution = first.resolution;
    const api = client(first.sessionID).session;
    const options = { signal: AbortSignal.timeout(15_000) };
    await api.get({ sessionID: first.sessionID }, options);
    for (const entry of group) {
      const reply = entry.resolution;
      try {
        if (reply.status === "answered") await api.form.reply({ sessionID: entry.sessionID, formID: entry.id, answer: reply.answer }, options);
        else await api.form.cancel({ sessionID: entry.sessionID, formID: entry.id }, options);
      } catch (error) {
        if (![404, 409].includes(errorStatus(error) ?? 0)) throw error;
      }
    }
    const responses = group.map(entry => {
      const reply = entry.resolution;
      if (reply.status === "answered") return {
        question_id: entry.id, status: reply.status,
        answers: entry.input.questions.map((question, index) => ({ question: question.title, answer: reply.answer[`q${index}`] })),
      };
      return { question_id: entry.id, status: reply.status };
    });
    try {
      await api.synthetic({
        sessionID: first.sessionID, id: resolution.messageID,
        text: JSON.stringify({ type: "async_question_response", ...(responses.length === 1 ? responses[0] : { responses }) }),
        description: first.input.questions[0].title,
        metadata: { source: "openchamber-async-question", questionIDs: group.map(entry => entry.id) },
        delivery: "steer", resume: !await isSessionArchived(first.sessionID),
      }, options);
    } catch (error) {
      if (errorStatus(error) !== 409) throw error;
    }
    await commit([], group);
  };
  const reconcileAll = async () => {
    if (!isEnabled()) return false;
    await load();
    let failed = false;
    for (const entry of entries.values()) {
      if (entry.resolution.status !== "pending") continue;
      try { await reconcileForm(entry); }
      catch (error) {
        if (errorStatus(error) === 404) await commit([], [entry]);
        else { failed = true; console.error("[agent-question] reconciliation failed:", error); }
      }
    }
    const groups = new Map<string, [ResolvedEntry, ...ResolvedEntry[]]>();
    for (const entry of entries.values()) {
      const resolution = entry.resolution;
      if (resolution.status === "pending") continue;
      const key = JSON.stringify([entry.sessionID, resolution.messageID]);
      const group = groups.get(key);
      if (group) group.push({ ...entry, resolution });
      else groups.set(key, [{ ...entry, resolution }]);
    }
    for (const group of groups.values()) {
      try { await deliver(group.sort((left, right) => left.order - right.order)); }
      catch (error) {
        if (errorStatus(error) === 404) await commit([], group);
        else { failed = true; console.error("[agent-question] delivery failed:", error); }
      }
    }
    return failed;
  };
  const schedule = () => {
    if (stopped || retry) return;
    retry = setTimeout(() => {
      retry = undefined;
      void run(reconcileAll).then(failed => { if (failed) schedule(); }, error => {
        console.error("[agent-question] recovery failed:", error);
        schedule();
      });
    }, retryMs);
    retry.unref();
  };

  return {
    async materializePlugin(instanceDir: string) {
      const directory = path.join(instanceDir, "agent-question", "openchamber-question-tool");
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "openchamber-question-tool", type: "module", main: "./index.js" }));
      await fs.writeFile(path.join(directory, "index.js"), createQuestionPluginSource(), { mode: 0o600 });
      return directory;
    },
    ask(payload: QuestionRequest) {
      return run(async () => {
        if (!isEnabled()) throw usageError("Asynchronous questions require managed OpenCode.");
        const { sessionID, callID, input } = z.object({ sessionID: z.string().min(1), callID: z.string().min(1), input: questionInput }).parse(payload);
        await load();
        const id = `frm_ocq${createHash("sha256").update(JSON.stringify([sessionID, callID])).digest("hex").slice(0, 26)}`;
        let entry = entries.get(id);
        if (!entry) {
          const order = Math.max(0, ...[...entries.values()].map(value => value.order)) + 1;
          entry = { id, sessionID, callID, order, input, resolution: { status: "pending" } };
          await commit([entry]);
        }
        try { await reconcileForm(entry); }
        catch (error) { console.error("[agent-question] form creation pending:", error); schedule(); }
        return { question_id: id, status: "pending", message: "Questions sent. Answers will arrive as a new message in this session. Continue work that does not depend on the answers." };
      });
    },
    resolve(sessionID: string, formID: string, resolution: { status: "cancelled" } | { status: "answered"; answer: unknown }) {
      if (!isEnabled() || !formID.startsWith("frm_ocq")) return Promise.resolve(false);
      return run(async () => {
        await load();
        const entry = entries.get(formID);
        if (!entry || entry.sessionID !== sessionID) return false;
        await commit([resolvedEntry(entry, createMessageId(Date.now()), resolution.status === "cancelled" ? undefined : z.record(z.string(), z.string()).parse(resolution.answer))]);
        schedule();
        return true;
      });
    },
    resolveBatch(payload: BatchResolution) {
      return run(async () => {
        if (!isEnabled()) throw usageError("Asynchronous questions require managed OpenCode.");
        const { sessionID, replies } = batchSchema.parse(payload);
        if (new Set(replies.map(reply => reply.questionID)).size !== replies.length) throw usageError("Each question must appear once.");
        await load();
        const sources = replies.map(reply => {
          const entry = entries.get(reply.questionID);
          if (!entry || entry.sessionID !== sessionID) throw Object.assign(new Error("Question not found."), { status: 404 });
          return { entry, reply };
        });
        const existing = sources.filter(({ entry }) => entry.resolution.status !== "pending");
        const firstResolution = existing[0]?.entry.resolution;
        const messageID = firstResolution && firstResolution.status !== "pending" ? firstResolution.messageID : createMessageId(Date.now());
        if (existing.length && (existing.length !== sources.length || existing.some(({ entry }) => entry.resolution.status === "pending" || entry.resolution.messageID !== messageID))) {
          throw Object.assign(new Error("The question group has changed. Refresh pending questions before submitting."), { status: 409 });
        }
        const updates = sources.map(({ entry, reply }) => {
          return resolvedEntry(entry, messageID, reply.status === "answered" ? reply.answer : undefined);
        });
        await commit(updates);
        schedule();
        return { sessionID, questionIDs: sources.map(({ entry }) => entry.id) };
      });
    },
    start() {
      unsubscribe = [
        globalEventHub.subscribeStatus(status => { if (status.type === "connect") schedule(); }),
        globalEventHub.subscribeEvent(event => {
          const parsed = settlementEvent.safeParse(event.payload);
          if (!parsed.success) return;
          const { data, type } = parsed.data;
          void this.resolve(data.sessionID, data.id, type === "form.replied" ? { status: "answered", answer: parsed.data.data.answer } : { status: "cancelled" })
            .catch(error => { console.error("[agent-question] answer persistence failed:", error); schedule(); });
        }),
      ];
      schedule();
    },
    async stop() {
      stopped = true;
      if (retry) clearTimeout(retry);
      for (const off of unsubscribe) off();
      await serial;
    },
  };
}
