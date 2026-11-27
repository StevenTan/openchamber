import { sessionParentId } from '../session-lineage.js';
import type { SessionListInput, SessionsResponse } from '@opencode/client';
import type { SessionReader } from '../agent-backends/contracts.js';
import type { SessionClient } from './opencode-client-contract.js';
import type { createSessionArchive } from './session-archive.js';
import { hasMessage } from './contracts.js';

const ARCHIVED_PAGE_SIZE = 200;

export const listArchivedSubsessions = async (list: (input: SessionListInput) => Promise<SessionsResponse>, rootID: string) => {
  const childrenOf = new Map<string, string[]>();
  const seenCursors = new Set<string>();
  let cursor: string | null | undefined;
  do {
    const page = await list(cursor
      ? { cursor }
      : { archived: true, limit: ARCHIVED_PAGE_SIZE });
    for (const record of page?.data ?? []) {
      const parentID = sessionParentId(record);
      if (!record?.id || !record.time?.archived || !parentID) continue;
      const siblings = childrenOf.get(parentID);
      if (siblings) siblings.push(record.id);
      else childrenOf.set(parentID, [record.id]);
    }
    cursor = page?.data?.length ? page.cursor?.next : undefined;
    if (cursor && seenCursors.has(cursor)) cursor = undefined;
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  const seen = new Set([rootID]);
  const parents = [rootID];
  while (parents.length > 0) {
    const parentID = parents.shift();
    if (parentID === undefined) throw new Error('missing parent in archived session traversal');
    for (const childID of childrenOf.get(parentID) ?? []) {
      if (seen.has(childID)) continue;
      seen.add(childID);
      parents.push(childID);
    }
  }
  seen.delete(rootID);
  return [...seen];
};

export const restoreArchivedAfterSend = async (client: SessionClient, sessionID: string, archive: ReturnType<typeof createSessionArchive>, sessions?: Pick<SessionReader, 'get' | 'list'>) => {
  try {
    const session = await (sessions ? sessions.get(sessionID) : client.session.get({ sessionID }));
    if (sessionParentId(session)) return;
    const archivedAt = await archive.archivedAt(sessionID);
    if (!archivedAt) return;
    const subsessionIDs = await listArchivedSubsessions(sessions ? sessions.list : input => client.session.list(input), sessionID);
    if (await archive.archivedAt(sessionID) !== archivedAt) return;
    const { failedIds } = await archive.unarchive([sessionID]);
    if (failedIds.length > 0) return;
    if (subsessionIDs.length > 0) await archive.unarchive(subsessionIDs);
  } catch (error) {
    console.warn(`[openchamber-sessions] could not restore ${sessionID} after a send:`, (hasMessage(error) ? error.message : undefined) ?? error);
  }
};
