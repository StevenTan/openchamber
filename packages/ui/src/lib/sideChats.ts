import { isOpencodeNotFound, opencodeClient } from '@/lib/opencode/client';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { findLastCompletedAssistantMessageID, insertForkIntoDirectoryStore, serverCutAfterAnswer } from '@/lib/btw';
import { findMessagePageItem } from '@/lib/opencode/messagePaging';
import { getSideChat, getSideChatSessionIDs, isTemporarySideChat, sideChatMetadata, withSideChatSaved, withSideChatSessionLink } from '@/lib/sessionSideChatMetadata';
import { getSyncMessages } from '@/sync/sync-refs';
import { forkAtTranscriptCut, transcriptCutAfterMessage } from '@/sync/transcript-cut';
import { createSession, deleteSession, patchSessionMetadata, updateSessionTitle, waitForConnectionOrThrow, type SessionCreateSelection } from '@/sync/session-actions';
import type { Session } from '@/lib/opencode/model';

const sideChatActions = new Map<string, Promise<unknown>>();

/** Save and close for the same chat commit in the order the user invoked them. */
function runSideChatAction<T>(sessionID: string, runtime: string, action: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([runtime, sessionID]);
  const previous = sideChatActions.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(action).finally(() => {
    if (sideChatActions.get(key) === pending) sideChatActions.delete(key);
  });
  sideChatActions.set(key, pending);
  return pending;
}

export async function createSideChat(parentSessionId: string | null, directory: string, selection: SessionCreateSelection, runtime: string, title: string): Promise<Session> {
  await waitForConnectionOrThrow();
  if (getRuntimeKey() !== runtime) throw new Error('runtime changed');
  const cleanup = await opencodeClient.captureSessionCleanup(directory, runtime);
  let session: Session | null = null;
  try {
    const messages = parentSessionId ? getSyncMessages(parentSessionId, directory) : [];
    const localAnswer = findLastCompletedAssistantMessageID(messages);
    const answer = localAnswer ?? (parentSessionId ? (await findMessagePageItem(parentSessionId, ({ info }) => info.role === 'assistant' && info.time.completed !== undefined && info.finish === 'stop', { limit: 30 }, directory))?.info.id : null);
    if (parentSessionId && answer) {
      const before = (localAnswer ? transcriptCutAfterMessage(messages, answer) : undefined) ?? await serverCutAfterAnswer(parentSessionId, answer, directory);
      session = await forkAtTranscriptCut(parentSessionId, before, directory, runtime);
      if (getRuntimeKey() !== runtime) throw new Error('runtime changed');
      const tail = await opencodeClient.getSessionMessages(session.id, { limit: 1 }, session.directory ?? directory);
      const last = tail.items.at(-1)?.info;
      if (!last) throw new Error('Inherited transcript boundary is missing');
      const metadata = sideChatMetadata(parentSessionId, { id: last.id, created: last.time.created, synthetic: last.role === 'synthetic' });
      session = await patchSessionMetadata(session.id, session.directory ?? directory, () => metadata, runtime);
      insertForkIntoDirectoryStore(session, session.directory ?? directory);
      await updateSessionTitle(session.id, title, { directory: session.directory ?? directory, expectedRuntimeKey: runtime });
    } else {
      session = await createSession(title, directory, sideChatMetadata(parentSessionId, null), undefined, selection, 'preserve', undefined, runtime);
      if (!session) throw new Error('Could not create side chat');
    }
    const id = session.id;
    if (parentSessionId) await patchSessionMetadata(parentSessionId, directory, (metadata) => withSideChatSessionLink(metadata, id, true), runtime);
    return session;
  } catch (error) {
    if (session) await cleanup(session.id);
    throw error;
  }
}

export function saveSideChat(sessionID: string, directory: string): Promise<void> {
  const runtime = getRuntimeKey();
  return runSideChatAction(sessionID, runtime, async () => {
    await patchSessionMetadata(sessionID, directory, withSideChatSaved, runtime);
  });
}

export function discardSideChat(sessionID: string, directory: string, runtime: string, confirmedSessionIDs?: ReadonlySet<string>): Promise<void> {
  return runSideChatAction(sessionID, runtime, async () => {
    const session = await readSideChat(sessionID, directory, runtime);
    if (isTemporarySideChat(session) && !await deleteSession(sessionID, { expectedRuntimeKey: runtime, temporarySideChatIDs: confirmedSessionIDs })) {
      throw new Error('Could not delete temporary side chat');
    }
    const parent = getSideChat(session)?.parentSessionID;
    if (parent) {
      try {
        await patchSessionMetadata(parent, directory, (metadata) => withSideChatSessionLink(metadata, sessionID, false), runtime);
      } catch (error) {
        if (!isOpencodeNotFound(error)) throw error;
      }
    }
  });
}

async function readSideChat(sessionID: string, directory: string, runtime: string): Promise<Session | null> {
  if (getRuntimeKey() !== runtime) throw new Error('runtime changed');
  let session: Session | null;
  try {
    session = await opencodeClient.getSession(sessionID, directory);
  } catch (error) {
    if (!isOpencodeNotFound(error)) throw error;
    session = null;
  }
  if (getRuntimeKey() !== runtime) throw new Error('runtime changed');
  return session;
}

/** The deletion set includes temporary descendants and observes already requested saves. */
export async function getSideChatsForClose(sessionID: string, directory: string, runtime: string): Promise<Session[]> {
  const session = await runSideChatAction(sessionID, runtime, () => readSideChat(sessionID, directory, runtime));
  if (!session || !isTemporarySideChat(session)) return [];
  const descendants = await Promise.all(getSideChatSessionIDs(session).map((id) => getSideChatsForClose(id, session.directory, runtime)));
  return [session, ...descendants.flat()];
}
