import { Readable, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import * as acp from '@agentclientprotocol/sdk';

let restored = false;
const authMethod = process.argv[2];
let authenticated = !authMethod;
const cancellations = new Map();
acp.agent({ name: 'ACP fixture' })
  .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: { loadSession: true }, authMethods: authMethod ? [{ id: authMethod, name: 'Fixture authentication' }] : [] }))
  .onRequest(acp.methods.agent.authenticate, ({ params }) => {
    if (params.methodId !== authMethod) throw new Error('Unexpected authentication method.');
    authenticated = true;
    return {};
  })
  .onRequest(acp.methods.agent.session.new, () => {
    if (!authenticated) throw acp.RequestError.authRequired();
    return { sessionId: randomUUID() };
  })
  .onRequest(acp.methods.agent.session.load, () => {
    if (!authenticated) throw acp.RequestError.authRequired();
    restored = true;
    return {};
  })
  .onNotification(acp.methods.agent.session.cancel, ({ params }) => cancellations.get(params.sessionId)?.())
  .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
    const text = params.prompt.map(part => part.type === 'text' ? part.text : '').join('');
    const update = update => client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update });
    if (text === 'wait') {
      const cancelled = new Promise(resolve => cancellations.set(params.sessionId, resolve));
      await update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Started' } });
      await cancelled;
      return { stopReason: 'cancelled' };
    }
    if (text === 'permission') {
      const toolCall = { toolCallId: 'write-1', title: 'Write note.txt', kind: 'edit', status: 'pending', rawInput: { path: 'note.txt' } };
      await update({ sessionUpdate: 'tool_call', ...toolCall });
      const reply = await client.request(acp.methods.client.session.requestPermission, {
        sessionId: params.sessionId, toolCall,
        options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject once', kind: 'reject_once' }],
      });
      await update({ sessionUpdate: 'tool_call_update', toolCallId: toolCall.toolCallId, status: 'completed', content: [{ type: 'diff', path: 'note.txt', oldText: 'before\n', newText: 'after\n' }] });
      await update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: JSON.stringify(reply.outcome) } });
    } else {
      await update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Thinking' } });
      await update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `${restored ? 'Restored: ' : ''}${text}` } });
    }
    return { stopReason: 'end_turn' };
  })
  .connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
