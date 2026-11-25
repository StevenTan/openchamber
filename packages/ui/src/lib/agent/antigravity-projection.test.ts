import { expect, test } from 'bun:test';
import type { AcpConversation, AcpTurn } from '@openchamber/sdk/agent-backends';
import { acpMessages, acpSession, acpCatalog } from './antigravity-projection';
import { partIds } from '../opencode/model';
import { applyDirectoryEvent } from '../../sync/event-reducer';
import { INITIAL_STATE, type State } from '../../sync/types';
import { computeContextUsage, computeLastReplyCacheHit } from '../../components/chat/work-status/contextUsage';

test('native context and cache counters feed the shared usage display', () => {
  const tokens = { input: 2536, output: 595, reasoning: 90, cache: { read: 15729, write: 0 } };
  const turn: AcpTurn = { id: 'user', assistantID: 'assistant', modelID: 'first', text: 'Test', files: [], created: 1, completed: 2, followups: [], tokens, context: { used: 18265, limit: 512000 }, updates: [{ sessionUpdate: 'usage_update', used: 18860, size: 1048576 }] };
  const session: AcpConversation = { id: 'session', nativeID: 'native', title: 'Test', directory: '/project', created: 1, updated: 2, draft: false, config: [{ id: 'model', name: 'Model', type: 'select', category: 'model', currentValue: 'first', options: [{ value: 'first', name: 'First' }, { value: 'unknown', name: 'Unknown' }] }], turns: [turn], tokens };
  const messages = acpMessages(session, turn).map(message => message.info);
  expect(computeContextUsage(messages, 512000)).toEqual({ state: 'measured', totalTokens: 18265, limit: 512000, percent: 3.5673828125 });
  expect(computeLastReplyCacheHit(messages)).toBeCloseTo(86.11552148918697);
  expect(acpSession(session).tokens).toEqual(tokens);
  session.archived = 3;
  expect(acpSession(session).time.archived).toBe(3);
  session.archived = null;
  expect(acpSession(session).time.archived).toBeUndefined();
  expect(acpCatalog(session).models.map(model => model.limit.context)).toEqual([512000, 0]);
  delete turn.context;
  expect(acpMessages(session, turn)[1].info).toMatchObject({ context: undefined });
  expect(acpCatalog(session).models.map(model => model.limit.context)).toEqual([0, 0]);
});

test('ACP tool patches retain completed output and the original response model', () => {
  const turn: AcpTurn = {
    id: 'user', assistantID: 'assistant', modelID: 'first', text: 'Run command', files: [], created: 1, completed: 4, followups: [],
    updates: [
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done' } },
      { sessionUpdate: 'tool_call', toolCallId: 'call', title: 'Run command', name: 'mcp_openchamber_commands_exec_command', status: 'in_progress', rawInput: { cmd: 'pwd' } },
      { sessionUpdate: 'tool_call_update', toolCallId: 'call', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: '/project' } }] },
      { sessionUpdate: 'tool_call_update', toolCallId: 'call', title: 'Command completed' },
    ],
  };
  const session: AcpConversation = { id: 'session', nativeID: 'native', title: 'Test', directory: '/project', created: 1, updated: 4, draft: false, config: [], turns: [turn] };
  const assistant = acpMessages(session, turn).find(message => message.info.role === 'assistant');
  expect(assistant?.info.role === 'assistant' && assistant.info.modelID).toBe('first');
  expect(assistant?.parts[1]).toMatchObject({ type: 'tool', tool: 'openchamber_commands_exec_command', state: { status: 'completed', input: { cmd: 'pwd' }, output: '/project' } });
  expect(acpMessages(session, JSON.parse(JSON.stringify(turn)))).toEqual(acpMessages(session, turn));
});

test('ACP user messages reconcile optimistic text and attachments in place', () => {
  const file = { mime: 'image/png', filename: 'image.png', url: 'data:image/png;base64,AA==' };
  const turn: AcpTurn = { id: 'user', assistantID: 'assistant', modelID: 'model', text: 'Test MCP tools', files: [file], created: 1, updates: [], followups: [{ id: 'followup', text: 'Continue', files: [file], created: 2 }] };
  const session: AcpConversation = { id: 'session', nativeID: 'native', title: 'Test', directory: '/project', created: 1, updated: 2, draft: false, config: [], turns: [turn] };
  const state: State = { ...INITIAL_STATE, message: { session: [] }, part: {} };
  for (const input of [turn, ...turn.followups]) {
    const info = { id: input.id, sessionID: session.id, role: 'user' as const, time: { created: input.created } };
    state.message.session.push(info);
    state.part[input.id] = [
      { id: partIds.userText(input.id), sessionID: session.id, messageID: input.id, type: 'text', text: input.text },
      { ...file, id: partIds.userFile(input.id, 0), sessionID: session.id, messageID: input.id, type: 'file' },
    ];
  }
  for (const message of acpMessages(session, turn)) {
    applyDirectoryEvent(state, { type: 'message.updated', properties: { info: message.info } });
    for (const part of message.parts) applyDirectoryEvent(state, { type: 'message.part.updated', properties: { sessionID: session.id, part } });
  }
  for (const input of [turn, ...turn.followups]) {
    expect(state.part[input.id]).toHaveLength(2);
    expect(state.part[input.id].filter(part => part.type === 'text').map(part => part.text)).toEqual([input.text]);
  }
});
