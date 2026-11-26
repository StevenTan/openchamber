import { AGENT_MCP_SERVERS } from '../../agent-tool/catalog.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { Effect, Option, Schema, Stream, type Types } from 'effect';
import type { AgentApi, EventApi, SessionApi } from '@opencode/client/effect/api';
import type { Agent } from '@opencode/schema/agent';
import type { Session } from '@opencode/schema/session';
import { Tool } from '@opencode/schema/tool';
import { assertFileSkill, type SkillRegistry } from './skill-policy.js';
import { controlMcpInput } from '../../agent-tool/control-mcp.js';
import { isAgentPrompt, RENDER_PAGE_CLOSED_IN_CHAT_NOTE } from '../../openchamber-control/render-page.js';
import { OPENCHAMBER_RENDER_ACTION_DEFINITIONS, OPENCHAMBER_IMAGE_ACTION_DEFINITIONS, OPENCHAMBER_SECRET_ACTION_DEFINITIONS, resolveAgentToolAction } from '../../openchamber-control/actions.js';
import { SECRET_REQUEST_CLOSED_IN_CHAT_NOTE } from '../../openchamber-control/secret-request.js';

interface InstructionSource { key: string; text: string }
interface SystemPart { type: 'text'; text: string; metadata?: { experimental?: { instructions?: InstructionSource[] } } }
interface Request { sessionID: Session.ID; agent: Agent.ID; system: SystemPart[]; tools: Record<string, { description: string }>; messages: Array<{ role: string; content: unknown[] }> }
interface Prompt { sessionID: string; messageID: string; delivery?: string; metadata?: Parameters<typeof isAgentPrompt>[0] }
interface PluginContext {
  location: { directory: string };
  agent: Pick<AgentApi, 'get'>;
  skill: SkillRegistry;
  session: Pick<SessionApi, 'get'> & {
    hook(name: 'context' | 'compaction' | 'generate', run: (event: Request) => Effect.Effect<void>): Effect.Effect<unknown>;
    hook(name: 'prompt', run: (event: Prompt) => Effect.Effect<void>): Effect.Effect<unknown>;
  };
  event: Pick<EventApi, 'subscribe'>;
  mcp: { transform(run: (servers: { set(name: string, config: { type: 'remote'; url: string; oauth: false; codemode: false; headers: { authorization: string } }): void }) => void): Effect.Effect<unknown> };
  tool: {
    transform(run: (editor: {
      list(): readonly (Tool.Info & { id: string })[];
      update(id: string, change: (tool: Types.Mutable<Pick<Tool.Info, 'options' | 'execute'>>) => void): void;
    }) => void): Effect.Effect<unknown>;
    hook(name: 'execute.before', run: (event: { tool: string; input: unknown }) => Effect.Effect<void, Tool.Error>): Effect.Effect<unknown>;
  };
}

const executeName = 'openchamber_execute';
const skillInput = Schema.Struct({ id: Schema.String });
const object = Schema.decodeUnknownSync(Schema.JsonObject);
const cardActions = new Map([
  ['openchamber_render', OPENCHAMBER_RENDER_ACTION_DEFINITIONS],
  ['openchamber_image', OPENCHAMBER_IMAGE_ACTION_DEFINITIONS],
  ['openchamber_secret', OPENCHAMBER_SECRET_ACTION_DEFINITIONS],
]);

export default {
  id: 'openchamber-code-mode',
  effect: (ctx: PluginContext) => Effect.gen(function* () {
    const endpoint = new URL(AGENT_MCP_SERVERS.openchamber.path, process.env.OPENCHAMBER_AGENT_TOOL_URL);
    const headers = { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN };
    yield* ctx.mcp.transform(servers => servers.set(AGENT_MCP_SERVERS.openchamber.name, { type: 'remote', url: endpoint.href, oauth: false, codemode: false, headers }));
    const client = yield* Effect.acquireRelease(Effect.tryPromise(async () => {
      const client = new Client({ name: 'openchamber-opencode', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers } }));
      return client;
    }), client => Effect.promise(() => client.close()));
    const pagesWaitingForChat = new Map<string, Set<AbortController>>();
    const pendingByUser = new Map<string, string>();
    const endWaits = (sessionID: string) => {
      for (const controller of pagesWaitingForChat.get(sessionID) ?? []) controller.abort();
    };
    yield* ctx.session.hook('prompt', event => Effect.sync(() => {
      if (isAgentPrompt(event.metadata)) return;
      pendingByUser.set(event.messageID, event.sessionID);
      if (event.delivery !== 'queue') endWaits(event.sessionID);
    }));
    yield* Stream.runForEach(ctx.event.subscribe({ types: ['session.inbox.delivery.changed', 'session.inbox.delivered', 'session.inbox.cancelled', 'session.deleted'] }), event => Effect.sync(() => {
      if (event.type === 'session.deleted') {
        for (const [inboxID, sessionID] of pendingByUser) if (sessionID === event.data.sessionID) pendingByUser.delete(inboxID);
        return;
      }
      if (event.type === 'session.inbox.delivery.changed') {
        const sessionID = pendingByUser.get(event.data.inboxID);
        if (sessionID && event.data.delivery === 'steer') endWaits(sessionID);
      }
      if (event.type === 'session.inbox.delivered' || event.type === 'session.inbox.cancelled') pendingByUser.delete(event.data.inboxID);
    })).pipe(Effect.forkIn(yield* Effect.scope));
    yield* ctx.tool.transform(editor => {
      for (const tool of editor.list()) {
        editor.update(tool.id, value => {
          const { pinned: _pinned, ...options } = value.options ?? {};
          value.options = { ...options, codemode: false };
          const card = cardActions.get(tool.id);
          if (card) {
            value.execute = (input, context) => Effect.tryPromise({ try: async signal => {
              const args = controlMcpInput(object(input), card.length === 1 ? card[0]?.action : undefined);
              const action = resolveAgentToolAction(args.action ?? null, tool.id).action ?? args.action;
              const chat = new AbortController();
              const waiting = tool.id === 'openchamber_secret'
                ? action !== 'secret.forget' || args.saved === true || args.saved === 'true'
                : action === 'render.page' && (args.awaitAnswer === true || args.awaitAnswer === 'true');
              const active = pagesWaitingForChat.get(context.sessionID) ?? new Set();
              if (waiting) { active.add(chat); pagesWaitingForChat.set(context.sessionID, active); }
              const metadata = { schemaVersion: 1, action, description: card.find(entry => entry.action === action)?.title ?? action };
              await Effect.runPromise(context.progress(object({ [tool.id]: metadata })));
              let output;
              try {
                const result = CallToolResultSchema.parse(await client.callTool({ name: tool.id.slice('openchamber_'.length), arguments: object(args), _meta: {
                  'ai.opencode/sessionID': context.sessionID, 'openchamber/callID': context.id,
                } }, CallToolResultSchema, { signal: AbortSignal.any([signal, chat.signal]), timeout: 43_200_000 }));
                if (result.isError) throw new Error(result.content.filter(part => part.type === 'text').map(part => part.text).join('\n'));
                output = object(result.structuredContent);
              } catch (error) {
                if (signal.aborted || !chat.signal.aborted) throw error;
                output = { schemaVersion: 1, ok: true, action, data: { answer: { answered: false, reason: 'chat' }, note: tool.id === 'openchamber_secret' ? SECRET_REQUEST_CLOSED_IN_CHAT_NOTE : RENDER_PAGE_CLOSED_IN_CHAT_NOTE } };
              } finally {
                active.delete(chat);
                if (active.size === 0) pagesWaitingForChat.delete(context.sessionID);
              }
              const answer = object(output.data ?? {}).answer;
              return { output, content: JSON.stringify(output), metadata: { openchamber: { ...metadata, ok: output.ok, ...answer !== undefined && { answer } } } };
            }, catch: error => new Tool.Error({ message: String(error) }) });
            return;
          }
          if (tool.id !== executeName) return;
          value.options = { ...value.options, permission: 'execute' };
          value.execute = (input, context) => Effect.tryPromise({ try: async signal => {
            const result = CallToolResultSchema.parse(await client.callTool({ name: 'execute', arguments: object(input), _meta: {
              'ai.opencode/sessionID': context.sessionID,
              'openchamber/source': { sessionID: context.sessionID, messageID: context.messageID, id: context.id, directory: ctx.location.directory },
            } }, CallToolResultSchema, { signal, timeout: 43_200_000,
              onprogress: progress => { if (progress.message) void Effect.runPromise(context.progress(object(JSON.parse(progress.message)))); },
            }));
            if (result.isError) throw new Error(result.content.filter(part => part.type === 'text').map(part => part.text).join('\n'));
            return { output: result.structuredContent, metadata: object(result._meta), content: result.content.flatMap<Tool.Content>(part =>
              part.type === 'text' ? [{ type: 'text' as const, text: part.text }]
                : part.type === 'image' ? [{ type: 'file' as const, uri: `data:${part.mimeType};base64,${part.data}`, mime: part.mimeType }] : []),
            };
          }, catch: error => new Tool.Error({ message: String(error) }) });
        });
      }
    });
    yield* ctx.tool.hook('execute.before', event => Effect.gen(function* () {
      if (event.tool !== 'skill') return;
      const decoded = Schema.decodeUnknownOption(skillInput)(event.input);
      if (Option.isSome(decoded)) yield* assertFileSkill(ctx.skill, decoded.value.id);
    }));
    for (const name of ['context', 'compaction', 'generate'] as const) yield* ctx.session.hook(name, event => Effect.gen(function* () {
      const [session, agent] = yield* Effect.all([
        ctx.session.get({ sessionID: event.sessionID }), ctx.agent.get({ agentID: event.agent }),
      ], { concurrency: 'unbounded' });
      const rules = [...agent.data.permissions, ...session.permissions ?? []];
      const guidance = yield* Effect.promise(async () => {
        const response = await fetch(new URL('/api/openchamber/skills', endpoint), { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ directory: ctx.location.directory, rules }) });
        if (!response.ok) throw new Error(`Skill catalog request failed: ${response.status}`);
        return Schema.decodeUnknownSync(Schema.Struct({ text: Schema.String }))(await response.json()).text;
      });
      delete event.tools.execute;
      delete event.tools.skill;
      for (const part of event.system) {
        const sources = part.metadata?.experimental?.instructions;
        if (!sources) continue;
        const instructions = sources.filter(source => source.key !== 'core/codemode').map(source => source.key === 'core/skill-guidance' ? { ...source, text: guidance } : source);
        part.metadata = { ...part.metadata, experimental: { ...part.metadata?.experimental, instructions } };
        part.text = instructions.map(source => source.text).join('\n\n');
      }
    }));
  }),
};
