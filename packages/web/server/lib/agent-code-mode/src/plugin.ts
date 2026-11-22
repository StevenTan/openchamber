import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { Effect, Option, Schema, type Types } from 'effect';
import type { AgentApi, SessionApi } from '@opencode/client/effect/api';
import type { Agent } from '@opencode/schema/agent';
import type { Session } from '@opencode/schema/session';
import { Tool } from '@opencode/schema/tool';
import { assertFileSkill, filterVirtualSkillGuidance, type SkillRegistry } from './skill-policy.js';

interface InstructionSource { key: string; text: string }
interface SystemPart { type: 'text'; text: string; metadata?: { experimental?: { instructions?: InstructionSource[] } } }
interface Request { sessionID: Session.ID; agent: Agent.ID; system: SystemPart[]; tools: Record<string, { description: string }>; messages: Array<{ role: string; content: unknown[] }> }
interface PluginContext {
  location: { directory: string };
  agent: Pick<AgentApi, 'get'>;
  skill: SkillRegistry;
  session: Pick<SessionApi, 'get'> & { hook(name: 'context' | 'compaction' | 'generate', run: (event: Request) => Effect.Effect<void>): Effect.Effect<unknown> };
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

export default {
  id: 'openchamber-code-mode',
  effect: (ctx: PluginContext) => Effect.gen(function* () {
    const endpoint = new URL('/api/openchamber/code-mode/mcp', process.env.OPENCHAMBER_AGENT_TOOL_URL);
    const headers = { authorization: 'Bearer ' + process.env.OPENCHAMBER_AGENT_TOOL_TOKEN };
    yield* ctx.mcp.transform(servers => servers.set('openchamber', { type: 'remote', url: endpoint.href, oauth: false, codemode: false, headers }));
    const client = yield* Effect.acquireRelease(Effect.tryPromise(async () => {
      const client = new Client({ name: 'openchamber-opencode', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers } }));
      return client;
    }), client => Effect.promise(() => client.close()));
    yield* ctx.tool.transform(editor => {
      for (const tool of editor.list()) {
        editor.update(tool.id, value => {
          const { pinned: _pinned, ...options } = value.options ?? {};
          value.options = { ...options, codemode: false };
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
      const [session, agent, skills] = yield* Effect.all([
        ctx.session.get({ sessionID: event.sessionID }), ctx.agent.get({ agentID: event.agent }), ctx.skill.list(),
      ], { concurrency: 'unbounded' });
      filterVirtualSkillGuidance(event.system, skills.data, [...agent.data.permissions, ...session.permissions ?? []]);
      if (skills.data.some(skill => skill.path.startsWith('skill://'))) event.messages.push({ role: 'system', content: [{ type: 'text', text:
        'Use the current system skill directory for available skills; it supersedes historical skill catalog notices. Only file-backed skills are available through the skill tool.',
      }] });
      delete event.tools.execute;
      for (const part of event.system) {
        const sources = part.metadata?.experimental?.instructions;
        if (!sources?.some(source => source.key === 'core/codemode')) continue;
        const instructions = sources.filter(source => source.key !== 'core/codemode');
        part.metadata = { ...part.metadata, experimental: { ...part.metadata?.experimental, instructions } };
        part.text = instructions.map(source => source.text).join('\n\n');
      }
    }));
  }),
};
