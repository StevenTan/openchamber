import { expect, test } from 'bun:test';
import type { AcpConversation, AcpTurn } from '@openchamber/sdk/agent-backends';
import { acpMessages, acpSession, acpCatalog } from './antigravity-projection';
import { partIds } from '../opencode/model';
import { applyDirectoryEvent } from '../../sync/event-reducer';
import { INITIAL_STATE, type State } from '../../sync/types';
import { computeContextUsage, computeLastReplyCacheHit } from '../../components/chat/work-status/contextUsage';
import { projectTurnChangedFiles } from '../../components/chat/lib/turns/projectTurnSummary';
import { readContextPart } from '../messages/contextParts';
import { antigravityEvents } from '../../../../web/server/lib/agent-backends/antigravity-events';
import type { SyncEvent } from '@openchamber/sdk/conversations/events';

const turnEvents = (session: AcpConversation, turn: AcpTurn): SyncEvent[] => [
  ...acpMessages(session, turn).flatMap(({ info, parts }): SyncEvent[] => [{ type: 'message.updated', properties: { info } }, ...parts.map(part => ({ type: 'message.part.updated' as const, properties: { sessionID: session.id, part } }))]),
  { type: 'session.status', properties: { sessionID: session.id, status: { type: turn.completed ? 'idle' : 'busy' } } },
];

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
    id: 'user', assistantID: 'assistant', modelID: 'first', text: 'Run command', files: [], created: 1, completed: 4,
    followups: [{ id: 'steer', text: 'Continue', files: [], created: 2, updateIndex: 2, toolCallCount: 0 }],
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
  expect(acpMessages(session, turn).at(-1)?.parts).toEqual([]);
  expect(acpMessages(session, JSON.parse(JSON.stringify(turn)))).toEqual(acpMessages(session, turn));
});

test('ACP file activity carries the persisted turn diff reference through history projection', () => {
  const turn: AcpTurn = { id: 'user', assistantID: 'assistant', modelID: 'model', text: 'Edit', files: [], created: 1, followups: [],
    fileDiff: { turnID: 'user', revision: 2, files: [{ file: 'code.txt', status: 'modified', additions: 1, deletions: 1 }] },
    toolCalls: [{ id: 'edit', callID: 'request', namespace: 'file', name: 'edit', input: { path: 'code.txt' }, started: 1, completed: 2, updateIndex: 0,
      metadata: { files: [{ file: 'code.txt', patch: '@@ -1 +1 @@\n-before\n+after\n', additions: 1, deletions: 1, status: 'modified' }] },
      result: { content: [{ type: 'text', text: 'Edited' }] } }],
    updates: [{ sessionUpdate: 'tool_call', toolCallId: 'native', name: 'mcp_file_edit', title: 'Edit', status: 'completed', rawInput: { path: 'code.txt' } }],
  };
  const session: AcpConversation = { id: 'session', nativeID: 'native', title: 'Test', directory: '/project', created: 1, updated: 2, draft: false, config: [], turns: [turn] };
  const projected = acpMessages(session, JSON.parse(JSON.stringify(turn)));
  expect(projected[1].parts).toHaveLength(1);
  expect(projected[1].parts[0]).toMatchObject({ tool: 'file_edit', callID: 'request', state: { output: 'Edited', metadata: { files: turn.toolCalls?.[0].metadata?.files, openchamberTurnDiff: turn.fileDiff } } });
  expect(projectTurnChangedFiles([projected[1]])).toEqual([{ file: 'code.txt', additions: 1, deletions: 1, turnId: 'user' }]);
});

test('ACP user messages reconcile optimistic text and attachments in place', () => {
  const file = { mime: 'image/png', filename: 'image.png', url: 'data:image/png;base64,AA==' };
  const metadata = { openchamberContext: { kind: 'chat-quote', quote: 'Original answer', text: 'Explain this' } };
  const turn: AcpTurn = { id: 'user', assistantID: 'assistant', modelID: 'model', text: 'Test MCP tools', files: [file], created: 1, inputContext: [{ id: 'quote', text: 'Original answer', metadata }], updates: [], followups: [{ id: 'followup', text: 'Continue', files: [file], created: 2, updateIndex: 0, toolCallCount: 0, inputContext: [{ id: 'followup_quote', text: 'Original answer', metadata }] }] };
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
    const index = state.message.session.findIndex(message => message.id === input.id);
    expect(readContextPart(state.message.session[index - 1])).toMatchObject({ kind: 'chat-quote', quote: 'Original answer', text: 'Explain this' });
  }
});

test('same-turn rewind replaces the retained reply in live and history message order', () => {
  const turn: AcpTurn = { id: 'user', assistantID: 'assistant', modelID: 'model', text: 'Start', files: [], created: 1, completed: 3,
    updates: [{ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Before input' } }, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'After input' } }],
    followups: [{ id: 'followup', text: 'Change', files: [], created: 2, updateIndex: 1, toolCallCount: 0, inputContext: [{ id: 'quote', text: 'Follow-up quote' }] }] };
  const session: AcpConversation = { id: 'session', nativeID: 'native', title: 'Test', directory: '/project', created: 1, updated: 3, draft: false, config: [], turns: [turn] };
  {
    const state: State = { ...INITIAL_STATE, message: {}, part: {} };
    for (const event of turnEvents(session, turn)) applyDirectoryEvent(state, event);
    const retained = { ...turn, updates: turn.updates.slice(0, 1), followups: [] };
    for (const event of antigravityEvents({ type: 'reverted', session, messageID: 'quote', turn: retained })) applyDirectoryEvent(state, event);
    expect(state.message.session.map(message => message.id)).toEqual(['user', 'assistant']);
    expect(state.part.assistant.map(part => part.type === 'text' && part.text)).toEqual(['Before input']);
    expect(state.part.followup).toBeUndefined();
  }
  turn.followups.push({ id: 'second', text: 'Change again', files: [], created: 3, updateIndex: 2, toolCallCount: 0 });
  turn.updates.push({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'After second input' } });
  const state: State = { ...INITIAL_STATE, message: {}, part: {} };
  for (const event of turnEvents(session, turn)) applyDirectoryEvent(state, event);
  const retained = { ...turn, updates: turn.updates.slice(0, 2), followups: turn.followups.slice(0, 1) };
  for (const event of antigravityEvents({ type: 'reverted', session, messageID: 'second', turn: retained })) applyDirectoryEvent(state, event);
  expect(state.message.session.map(message => message.id)).toEqual(['user', 'assistant', 'quote', 'followup', 'followup_assistant']);
  expect(state.part.assistant.map(part => part.type === 'text' && part.text)).toEqual(['Before input']);
  expect(state.part.followup_assistant).toMatchObject([{ type: 'reasoning', text: 'After input' }]);
  expect(state.part.second_assistant).toBeUndefined();
});

test('steering separates preceding activity from subsequent text and tool calls in live and stored transcripts', () => {
  const session: AcpConversation = { id: 'session', nativeID: 'native', title: 'Test', directory: '/project', created: 1, updated: 5, draft: false, config: [], turns: [] };
  const turn: AcpTurn = { id: 'user', assistantID: 'assistant', modelID: 'model', text: 'Test files', files: [], created: 1, updates: [], followups: [], toolCalls: [] };
  const state: State = { ...INITIAL_STATE, message: {}, part: {} };
  const publish = () => {
    for (const event of turnEvents(session, turn)) applyDirectoryEvent(state, event);
  };
  turn.updates.push({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Before steering' } });
  turn.toolCalls!.push({ id: 'first', callID: 'first', namespace: 'file', name: 'write', input: {}, started: 1, updateIndex: 1 });
  publish();
  turn.followups.push({ id: 'steer', text: 'Also test browser', files: [], created: 2, updateIndex: 1, toolCallCount: 1 });
  publish();
  turn.toolCalls![0].completed = 3;
  turn.toolCalls![0].result = { content: [{ type: 'text', text: 'Written' }] };
  turn.toolCalls!.push({ id: 'second', callID: 'second', namespace: 'browser', name: 'snapshot', input: {}, started: 3, completed: 4, updateIndex: 1 });
  turn.updates.push({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'After steering' } });
  publish();
  turn.followups.push({ id: 'answer', text: 'Question answer', files: [], created: 4, updateIndex: 2, toolCallCount: 2, inputContext: [{ id: 'context', text: 'Answer metadata' }] });
  turn.updates.push({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done' } });
  turn.completed = 5;
  turn.tokens = { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } };
  publish();
  const history = acpMessages(session, JSON.parse(JSON.stringify(turn)));
  expect(history.map(record => record.info.id)).toEqual(['user', 'assistant', 'steer', 'steer_assistant', 'context', 'answer', 'answer_assistant']);
  expect(state.message.session.map(message => message.id)).toEqual(history.map(record => record.info.id));
  for (const record of history) expect(state.part[record.info.id] ?? []).toMatchObject(record.parts);
  expect(history[1].parts.map(part => part.type)).toEqual(['reasoning', 'tool']);
  expect(history[1].parts[1]).toMatchObject({ messageID: 'assistant', state: { status: 'completed', output: 'Written' } });
  expect(history[3].parts.map(part => part.type)).toEqual(['tool', 'reasoning']);
  expect(history[3].parts[1]).toMatchObject({ text: 'After steering', messageID: 'steer_assistant' });
  expect(history[1].info).toMatchObject({ time: { completed: 2 } });
  expect(history[3].info).toMatchObject({ time: { completed: 4 } });
  expect(history[1].info).not.toHaveProperty('tokens');
  expect(history[6].info).toMatchObject({ tokens: turn.tokens, time: { completed: 5 } });
});
