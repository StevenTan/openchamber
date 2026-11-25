import { z } from 'zod';
import type { Tool } from '@opencode/schema/tool';
import { controlErrorFields } from '../openchamber-control/error.js';
import { recordedTurnDiffSchema } from '@openchamber/sdk/agent-backends';

type JsonObject = z.infer<typeof metadata>;
type BridgeInput = { sessionID: string; turnID?: string; directory?: string } | { entries: { key: string; value: JsonObject }[] };

interface Message { id: string; type: string; text: string; finish?: string; metadata?: { source?: string } }
interface Call { sessionID: string; messageID: string; tool: string; status: string; result: { metadata?: Tool.Metadata }; error: { metadata?: Tool.Metadata } }
interface Context {
  location: { directory: string };
  storage: {
    scan(input: { prefix: string; after?: string }): Promise<{ entries: { key: string; value: JsonObject }[]; next?: string }>;
    remove(key: string): Promise<void>;
  };
  session: { context(input: { sessionID: string }): Promise<Message[]>; get(input: { sessionID: string }): Promise<void> };
  tool: { hook(name: string, run: (event: Call) => Promise<void>): Promise<void> };
  rpc: { register(description: typeof definition, handlers: { read(input: { sessionID: string; turnID: string }): Promise<z.infer<typeof recordedTurnDiffSchema>> }): Promise<void> };
  event: { subscribe(input: { types: string[]; signal: AbortSignal }): AsyncIterable<{ type: string; data: { sessionID: string; reason?: string; assistantMessageID: string } }> };
}
const definition = { id: 'openchamber-turn-diffs', methods: { read: {
  input: { type: 'object', properties: { sessionID: { type: 'string' }, turnID: { type: 'string' } }, required: ['sessionID', 'turnID'], additionalProperties: false }, output: { type: 'object' },
} }, events: {} };
const metadata = z.record(z.string(), z.json());
const capturedTools = ['file_write', 'file_edit', 'file_patch', 'execute', 'openchamber_execute'];
const isAsyncQuestionAnswer = (message: Message) => {
  if (message.type !== 'synthetic' || message.metadata?.source !== 'openchamber-async-question') return false;
  try {
    const body = JSON.parse(message.text);
    if (body.type !== 'async_question_response') return false;
    return (body.responses ?? [body]).some((reply: { status: string; answers: unknown[] }) => reply.status === 'answered' && reply.answers.length > 0);
  } catch { return false; }
};

export default {
  id: 'openchamber-turn-diffs',
  async setup(ctx: Context) {
    const request = async (action: string, input: BridgeInput) => {
      const response = await fetch(new URL(`/api/openchamber/turn-diffs/${action}`, process.env.OPENCHAMBER_AGENT_TOOL_URL), {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN }, body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`Turn diff ${action} failed: ${response.status} ${await response.text()}`);
      return metadata.parse(await response.json());
    };
    for (const prefix of ['turn:', 'active:']) {
      let after: string | undefined;
      do {
        const page = await ctx.storage.scan({ prefix, ...after && { after } });
        if (page.entries.length) await request('import', { entries: page.entries });
        for (const entry of page.entries) await ctx.storage.remove(entry.key);
        after = page.next;
      } while (after);
    }
    const anchors = new Map<string, { messageID: string; turnID: string }>();
    const anchorFor = async (sessionID: string, messageID: string) => {
      const cached = anchors.get(sessionID);
      if (cached?.messageID === messageID) return cached.turnID;
      const messages = await ctx.session.context({ sessionID });
      let turnID, noticeID, answered = false;
      for (const message of messages) {
        if (message.id === messageID) break;
        if (message.type === 'user' || message.type === 'compaction' || isAsyncQuestionAnswer(message)) {
          turnID = message.id;
          noticeID = undefined;
          answered = false;
        } else if (message.type === 'assistant') {
          if (noticeID) turnID = noticeID;
          noticeID = undefined;
          answered = message.finish === 'stop';
        } else if (answered) noticeID = message.id;
      }
      turnID = noticeID ?? turnID;
      if (!turnID) throw new Error('File change has no turn anchor');
      anchors.set(sessionID, { messageID, turnID });
      return turnID;
    };
    const begin = async (sessionID: string, messageID: string) => request('begin', { sessionID, turnID: await anchorFor(sessionID, messageID), directory: ctx.location.directory });
    await ctx.tool.hook('execute.before', async event => {
      if (capturedTools.includes(event.tool)) await begin(event.sessionID, event.messageID);
    });
    await ctx.tool.hook('execute.after', async event => {
      if (!capturedTools.includes(event.tool)) return;
      if (event.tool.startsWith('file_') && event.status === 'completed') return;
      const reference = metadata.parse(await request('reference', { sessionID: event.sessionID, turnID: await anchorFor(event.sessionID, event.messageID) }));
      const result = event.status === 'completed' ? event.result : event.error;
      result.metadata = { ...result.metadata, openchamberTurnDiff: reference };
    });
    await ctx.rpc.register(definition, { read: async input => {
      await ctx.session.get({ sessionID: input.sessionID });
      return recordedTurnDiffSchema.parse(await request('read', input));
    } });
    const controller = new AbortController();
    const events = (async () => {
      for await (const event of ctx.event.subscribe({ types: ['session.step.started', 'session.execution.succeeded', 'session.execution.failed', 'session.execution.interrupted', 'session.deleted'], signal: controller.signal })) {
        const sessionID = event.data.sessionID;
        if (event.type === 'session.execution.interrupted' && event.data.reason === 'shutdown') continue;
        try {
          if (event.type === 'session.step.started') await begin(sessionID, event.data.assistantMessageID);
          else {
            anchors.delete(sessionID);
            await request(event.type === 'session.deleted' ? 'remove' : 'finish', { sessionID });
          }
        } catch (error) { console.error('[turn-diffs] finalization failed:', controlErrorFields(error)?.message); }
      }
    })().catch(error => { if (!controller.signal.aborted) console.error('[turn-diffs] event stream failed:', controlErrorFields(error)?.message); });
    return async () => { controller.abort(); await events; };
  },
};
