import type { OpenCodeClient, SessionInfo } from '@opencode/client';
import type { Session } from '@openchamber/sdk/conversations/model';
import type { SessionPatch, SyncEvent } from '@openchamber/sdk/conversations/events';
import type { SessionPage } from '@openchamber/sdk/conversations/http';
import type { BackendAdapter, BackendID, BackendRuntime } from './contracts.js';
import type { ConversationIndex, ConversationListing } from './conversation-index.js';
import { z } from 'zod';
import { hasTag } from '../openchamber-sessions/contracts.js';

export const sessionInfo = ({ directory, backendID: _backendID, ...info }: Session): SessionInfo => ({ ...info, location: { directory } });

export function createConversationCatalog(index: ConversationIndex, runtimes: Record<BackendID, BackendRuntime>, client: () => OpenCodeClient, publish: (events: SyncEvent[], directory: string) => void) {
  let imported: Promise<void> | undefined;
  let spaces: SessionPage['spaces'];
  const prepare = () => imported ??= (async () => {
    const api = runtimes.opencode.conversations({ client: client() });
    let cursor: string | undefined;
    do {
      const page = await api.list({ global: true, limit: 100, order: 'asc', cursor });
      for (const session of page.sessions) index.save(session, 'opencode');
      if (page.spaces) spaces = page.spaces;
      cursor = page.cursor.next;
    } while (cursor);
  })().catch(error => { imported = undefined; throw error; });
  const get = async (id: string, backendID: BackendID) => index.get(id) ?? index.save(await runtimes[backendID].conversations({ client: client() }).get(id), backendID);
  const change = async (id: string, backendID: BackendID, fields: Parameters<ConversationIndex['change']>[2], patch: SessionPatch) => {
    const info = index.change(id, await get(id, backendID), fields);
    publish([{ type: 'session.patched', properties: { sessionID: id, patch } }], info.directory);
  };
  const list = async (input: ConversationListing): Promise<SessionPage> => {
    if (input.backendID !== 'antigravity') await prepare();
    return { ...index.list(input), ...input.backendID !== 'antigravity' && spaces && { spaces } };
  };
  const wrap = (runtime: BackendRuntime): BackendAdapter => {
    const rename = (id: string, title: string) => change(id, runtime.id, { title }, { title });
    return {
      ...runtime,
      archive: {
        async setArchived(id, archived) {
          const at = archived ? Date.now() : null;
          await change(id, runtime.id, { archived: at }, { time: { archived: at } });
        },
        async readArchivedAt(id) {
          if (!index.get(id) && runtime.id === 'opencode') await prepare();
          const info = index.get(id);
          return info ? info.time.archived ?? null : undefined;
        },
      },
      metadata: {
        async read(id) {
          try { return (await get(id, runtime.id)).metadata ?? {}; }
          catch (error) { if (hasTag(error) && error._tag === 'SessionNotFoundError') return null; throw error; }
        },
        async write(id, metadata) {
          const value = z.record(z.string(), z.json()).parse(metadata ?? {});
          await change(id, runtime.id, { metadata: value }, { metadata: value });
        },
      },
      sessions: factory => ({
        ...runtime.sessions(factory),
        get: async id => sessionInfo(await get(id, runtime.id)),
        async list(input) {
          const page = await list({ ...input, backendID: runtime.id });
          return { data: page.sessions.map(sessionInfo), cursor: { next: page.cursor.next ?? null } };
        },
        rename,
      }),
      dispatch: context => {
        const dispatch = runtime.dispatch(context);
        return {
          ...dispatch,
          async create(...args) { const result = await dispatch.create(...args); await get(result.sessionId, runtime.id); return result; },
          async fork(...args) { const result = await dispatch.fork(...args); await get(result.sessionId, runtime.id); return result; },
        };
      },
      conversations: options => {
        const api = runtime.conversations(options);
        return {
          ...api,
          async create(input) {
            const info = await api.create(input);
            return index.save(info, runtime.id);
          },
          async fork(id, before) { return index.save(await api.fork(id, before), runtime.id); },
          list: input => list({ ...input, directory: options.directory, backendID: runtime.id }),
          get: id => get(id, runtime.id),
          rename,
        };
      },
    };
  };
  return { adapters: { opencode: wrap(runtimes.opencode), antigravity: wrap(runtimes.antigravity) }, list, reset: () => { imported = undefined; } };
}
export type ConversationCatalog = ReturnType<typeof createConversationCatalog>;
