import type { OpenCodeClient } from '@opencode/client';
import type { ConversationDeliveryApi } from './conversation-delivery.js';
import type { ConversationRuntime } from './conversation-runtime.js';
import { createMessageId } from '../dispatch-results/runtime.js';

export function createOpenCodeInput(client: OpenCodeClient, runtime: ConversationRuntime, directory?: string): ConversationDeliveryApi {
  const files = (input: Parameters<ConversationDeliveryApi['command']>[1]['files']) => input.length ? input.map(file => ({ uri: file.url, ...file.filename !== undefined && { name: file.filename } })) : undefined;
  return {
    async prompt(id, input) {
      for (const context of input.context) await client.session.synthetic({ sessionID: id, ...context, resume: false });
      await client.session.prompt({ sessionID: id, id: input.id, text: input.text, files: files(input.files), agents: input.agents.length ? input.agents.map(agent => ({ name: agent.name, ...agent.mention !== undefined && { mention: agent.mention } })) : undefined, skills: input.skills.length ? input.skills : undefined, metadata: input.metadata, delivery: input.delivery });
      runtime.admit(id, input, 'user', directory);
      return input.id;
    },
    command: async (sessionID, input) => { await client.session.command({ sessionID, name: input.name, text: input.text, files: files(input.files) }); },
    context: async (sessionID, { context = [], ...input }, options) => {
      const id = input.id ?? createMessageId(Date.now());
      for (const entry of context) await client.session.synthetic({ sessionID, ...entry, resume: false }, options);
      await client.session.synthetic({ sessionID, ...input, id }, options);
      runtime.admit(sessionID, { ...input, id, files: [], context }, 'synthetic', directory);
    },
  };
}
