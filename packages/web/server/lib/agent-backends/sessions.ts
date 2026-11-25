import type { SessionListInput } from '@opencode/client';
import type { BackendRegistry } from './registry.js';
import type { SessionClientFactory, SessionReader } from './contracts.js';
import { createOpenCodeSessionReader } from './opencode-adapter.js';

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
      const page = await openCode.list(input);
      const pages = await Promise.all((options.registry?.additional ?? []).map(adapter => adapter.sessions(options.openCode).list(input)));
      const own = pages.flatMap(page => page.data);
      return own.length ? { ...page, data: [...page.data, ...own].sort((a, b) => b.time.updated - a.time.updated) } : page;
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
