import type { SessionListInput } from '@opencode/client';
import type { BackendRegistry } from './registry.js';
import type { SessionClientFactory, SessionReader } from './contracts.js';
import { createOpenCodeSessionReader } from './opencode-adapter.js';
import { sessionInfo } from './conversation-catalog.js';

export function createApplicationSessions(options: { openCode: SessionClientFactory; registry?: BackendRegistry | undefined }) {
  const openCode = createOpenCodeSessionReader(options.openCode);
  const forSession = async (sessionID: string, client = options.openCode): Promise<SessionReader> => {
    await options.registry?.ready;
    return options.registry?.forSession(sessionID).sessions(client) ?? createOpenCodeSessionReader(client);
  };
  return {
    get: async (sessionID: string) => (await forSession(sessionID)).get(sessionID),
    async list(input: SessionListInput) {
      await options.registry?.ready;
      if (options.registry) {
        const page = await options.registry.list(input);
        return { data: page.sessions.map(sessionInfo), cursor: { next: page.cursor.next ?? null } };
      }
      const page = await openCode.list(input);
      return page;
    },
    async active(sessionID?: string) {
      await options.registry?.ready;
      if (sessionID && options.registry?.forSession(sessionID).id !== 'opencode') return (await forSession(sessionID)).active();
      return Object.assign({}, await openCode.active(), ...await Promise.all((options.registry?.additional ?? []).map(adapter => adapter.sessions(options.openCode).active())));
    },
    messages: async (sessionID: string, input: Parameters<SessionReader['messages']>[1]) => (await forSession(sessionID)).messages(sessionID, input),
    rename: async (sessionID: string, title: string) => (await forSession(sessionID)).rename(sessionID, title),
    interrupt: async (sessionID: string) => (await forSession(sessionID)).interrupt(sessionID),
    hasPendingInput: async (sessionID: string) => (await forSession(sessionID)).hasPendingInput(sessionID),
    forms: async (sessionID: string, client = options.openCode) => (await forSession(sessionID, client)).forms(sessionID),
  };
}
export type ApplicationSessions = ReturnType<typeof createApplicationSessions>;
