import { isAgentPrompt } from '../openchamber-control/render-page.js';
import type { BackendAdapter, SessionClientFactory, SessionReader } from './contracts.js';
import { createOpenCodeQuestionSession } from '../agent-question/src/runtime.js';

export const readOpenCodeModels: BackendAdapter['models'] = async (clientFor, directory) => {
  const client = await clientFor(directory);
  const [models, providers] = await Promise.all([client.model.list(), client.provider.list()]);
  return { models: models.data, providers: new Map(providers.data.map(provider => [provider.id, provider.name])) };
};

export const createOpenCodeSessionReader = (client: SessionClientFactory): SessionReader => ({
  get: async sessionID => (await client()).session.get({ sessionID }),
  list: async input => (await client(input.directory)).session.list(input),
  active: async () => (await client()).session.active(),
  messages: async (sessionID, input) => (await client()).message.list({ sessionID, ...input }),
  rename: async (sessionID, title) => (await client()).session.update({ sessionID, title }),
  interrupt: async sessionID => (await client()).session.interrupt({ sessionID }),
  hasPendingInput: async sessionID => (await (await client()).session.inbox.list({ sessionID })).some(item => item.type === 'user' && item.delivery === 'steer' && !isAgentPrompt(item.payload.metadata)),
  forms: async () => (await client()).session.form,
});

export function createOpenCodeAdapter(archive: BackendAdapter['archive'], metadata: BackendAdapter['metadata']): BackendAdapter {
  return {
    id: 'opencode', providers: [], archive, metadata,
    sessions: createOpenCodeSessionReader,
    dispatch: ({ openCode }) => ({ create: openCode.create, send: openCode.send, fork: openCode.fork, queueBackend: () => undefined }),
    modelCatalog: readOpenCode => directory => readOpenCode(directory),
    question: client => createOpenCodeQuestionSession(client().session),
    models: readOpenCodeModels,
  };
}
