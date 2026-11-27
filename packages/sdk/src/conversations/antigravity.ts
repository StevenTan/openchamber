import { z } from 'zod';
import type { AcpConversation, AcpTurn, AgentToolCall } from '../agent-backends.js';
import type { Session, Message, Part, ToolPart } from './model.js';
import type { ProviderCatalog } from './http.js';
import { partIds } from './identities.js';

const emptyUsage = () => ({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } });
export function acpSession(session: AcpConversation): Session {
  const model = session.config.find(option => option.category === 'model' && option.type === 'select');
  const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
  return { id: session.id, backendID: 'antigravity', projectID: session.directory, directory: session.directory,
    title: session.title, agent: 'antigravity', cost: 0, tokens: session.tokens ?? emptyUsage(), metadata: session.metadata ? z.record(z.string(), z.json()).parse(session.metadata) : undefined,
    ...model?.type === 'select' && { model: { id: model.currentValue, providerID: 'antigravity', ...thought?.type === 'select' && { variant: thought.currentValue } } },
    time: { created: session.created, updated: session.updated, ...session.archived != null && { archived: session.archived } },
    ...session.revert && { revert: session.revert } };
}

export function acpCatalog(session: AcpConversation): ProviderCatalog {
  const model = session.config.find(option => option.category === 'model' && option.type === 'select');
  const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
  const variants = thought?.type === 'select' ? thought.options.flatMap(option => 'group' in option ? option.options : [option]).map(option => ({ id: option.value })) : [];
  const models = model?.type === 'select' ? model.options.flatMap(option => 'group' in option ? option.options : [option]) : [];
  const limits = new Map(session.turns.map(turn => [turn.modelID, turn.context?.limit ?? 0]));
  return {
    providers: [{ id: 'antigravity', name: 'Antigravity', activation: 'enabled', package: 'antigravity' }],
    models: models.map(option => ({ id: option.value, modelID: option.value, providerID: 'antigravity', name: option.name,
      capabilities: { tools: true, input: ['text', 'image'], output: ['text'] }, variants,
      time: { released: 0 }, cost: [], status: 'active', enabled: true, limit: { context: limits.get(option.value) ?? 0, output: 0 } })),
    ...model?.type === 'select' && { default: { id: model.currentValue, providerID: 'antigravity', ...thought?.type === 'select' && { variant: thought.currentValue } } },
  };
}

export function acpMessages(session: Pick<AcpConversation, 'id'>, turn: AcpTurn): Array<{ info: Message; parts: Part[] }> {
  const base = { sessionID: session.id, messageID: turn.assistantID };
  const parts: Part[] = [];
  const tools = new Map<string, ToolPart>();
  const recorded = (call: AgentToolCall): ToolPart => {
    const output = call.result?.content.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? '';
    const metadata = z.record(z.string(), z.json()).parse({ ...call.result?._meta, ...call.metadata });
    const error = call.error ?? (call.result?.isError ? output : undefined);
    return { ...base, id: `${turn.assistantID}_${call.id}`, callID: call.callID, type: 'tool', tool: `${call.namespace}_${call.name}`,
      state: error !== undefined ? { status: 'error', input: z.record(z.string(), z.json()).parse(call.input), error, metadata, time: { start: call.started, end: call.completed! } }
        : call.completed ? { status: 'completed', input: z.record(z.string(), z.json()).parse(call.input), output, metadata, time: { start: call.started, end: call.completed }, attachments: call.result?.content.filter(item => item.type === 'image').map((item, index) => ({ ...base, type: 'file' as const, id: `${call.id}_${index}`, mime: item.mimeType!, url: `data:${item.mimeType};base64,${item.data}` })) }
          : { status: 'running', input: z.record(z.string(), z.json()).parse(call.input), metadata, time: { start: call.started } } };
  };
  for (let index = 0; index <= turn.updates.length; index++) {
    parts.push(...(turn.toolCalls ?? []).filter(call => call.updateIndex === index).map(recorded));
    const update = turn.updates[index];
    if (!update) break;
    if ((update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'agent_thought_chunk') && update.content.type === 'text') {
      const type = update.sessionUpdate === 'agent_message_chunk' ? 'text' : 'reasoning';
      const last = parts.at(-1);
      if (last?.type === type) last.text += update.content.text;
      else parts.push({ ...base, id: `${turn.assistantID}_${parts.length}`, type, text: update.content.text, time: { start: turn.created, ...turn.completed && { end: turn.completed } } });
    }
    if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
      if (turn.toolCalls) continue;
      let tool = tools.get(update.toolCallId);
      if (!tool) {
        tool = { ...base, id: `${turn.assistantID}_${update.toolCallId}`, callID: update.toolCallId, type: 'tool', tool: update.title ?? 'tool', state: { status: 'running', input: {}, time: { start: turn.created } } };
        tools.set(update.toolCallId, tool);
        parts.push(tool);
      }
      if (update.name) tool.tool = update.name.replace(/^mcp_/, '');
      const input = update.rawInput === undefined ? tool.state.input : z.record(z.string(), z.json()).parse(update.rawInput);
      const output = update.content?.map(content => content.type === 'content' && content.content.type === 'text' ? content.content.text : JSON.stringify(content)).join('\n') ?? (update.rawOutput === undefined ? tool.state.status === 'completed' ? tool.state.output : tool.state.status === 'error' ? tool.state.error : '' : JSON.stringify(update.rawOutput));
      const status = update.status ?? tool.state.status;
      if (status === 'completed') tool.state = { status: 'completed', input, output, time: { start: turn.created, end: turn.completed ?? turn.created } };
      else if (status === 'failed' || status === 'error') tool.state = { status: 'error', input, error: output, time: { start: turn.created, end: turn.completed ?? turn.created } };
      else tool.state = { status: 'running', input, time: { start: turn.created } };
    }
  }
  const changed = parts.filter(part => part.type === 'tool' && ['file_write', 'file_edit', 'file_patch', 'openchamber_execute'].includes(part.tool)).at(-1);
  if (turn.fileDiff && changed?.type === 'tool' && changed.state.status !== 'pending') changed.state.metadata = { ...changed.state.metadata, openchamberTurnDiff: turn.fileDiff };
  return [
    ...[{ id: turn.id, text: turn.text, files: turn.files, created: turn.created, inputContext: turn.inputContext }, ...turn.followups].flatMap(input => [
      ...(input.inputContext ?? []).map(item => ({
        info: { id: z.string().parse(item.id), sessionID: session.id, role: 'synthetic' as const, time: { created: input.created }, text: item.text, ...item.description && { description: item.description }, ...item.metadata && { metadata: item.metadata } },
        parts: [],
      })),
      {
        info: { id: input.id, sessionID: session.id, role: 'user' as const, time: { created: input.created } }, parts: [
          { id: partIds.userText(input.id), sessionID: session.id, messageID: input.id, type: 'text' as const, text: input.text },
          ...input.files.map((file, index) => ({ ...file, id: partIds.userFile(input.id, index), sessionID: session.id, messageID: input.id, type: 'file' as const })),
        ],
      },
    ]),
    { info: { id: turn.assistantID, sessionID: session.id, role: 'assistant', agent: 'antigravity', providerID: 'antigravity', modelID: turn.modelID, ...turn.variant && { variant: turn.variant }, time: { created: turn.created, ...turn.completed && { completed: turn.completed } },
      ...turn.completed && { finish: turn.error ? 'error' as const : 'stop' as const }, ...turn.error && { error: { type: 'AntigravityError', message: turn.error } },
      ...turn.tokens && { tokens: turn.tokens }, context: turn.context }, parts },
  ];
}
