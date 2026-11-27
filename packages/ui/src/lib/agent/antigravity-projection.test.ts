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
  for (const order of [['user', 'assistant', 'quote', 'followup'], ['user', 'quote', 'followup', 'assistant']]) {
    const state: State = { ...INITIAL_STATE, message: {}, part: {} };
    for (const event of antigravityEvents({ type: 'turn', sessionID: session.id, directory: session.directory, session, turn })) applyDirectoryEvent(state, event);
    state.message.session.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
    const retained = { ...turn, updates: turn.updates.slice(0, 1), followups: [] };
    for (const event of antigravityEvents({ type: 'reverted', session, messageID: 'quote', turn: retained })) applyDirectoryEvent(state, event);
    expect(state.message.session.map(message => message.id)).toEqual(['user', 'assistant']);
    expect(state.part.assistant.map(part => part.type === 'text' && part.text)).toEqual(['Before input']);
    expect(state.part.followup).toBeUndefined();
  }
});
