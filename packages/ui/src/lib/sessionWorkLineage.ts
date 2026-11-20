import { z } from 'zod';
import type { Session } from '@/lib/opencode/model';
import { isVSCodeRuntime } from '@/lib/desktop';
import { parseMetadata } from '@/lib/metadataParse';
import { normalizePath } from '@/lib/pathNormalization';
import { getBtwOriginalSessionID, isBtwSession, wasPromotedBtwSession } from '@/lib/sessionBtwMetadata';
import { getOriginalSessionID, isReviewSession } from '@/lib/sessionReviewMetadata';
import { getSideChat } from '@/lib/sessionSideChatMetadata';

/**
 * Which session a sidebar row nests under.
 *
 * A subagent nests under the run that spawned it (`parentID`, OpenCode's own
 * lineage). A side session of another one in the same folder nests under that
 * one too, so the work they share reads as one entry: an auto-review under the
 * session it reviews, and a `/btw` side conversation (promoted or not) or saved
 * side chat under its source session. A plain fork stays a root: it usually takes
 * the task another way, so it is a work of its own. A session another session's agent
 * started through the openchamber tool is the user's own conversation and
 * stays a root; its first message links back to the sender instead.
 *
 * The folder decides first. A session that runs in another worktree or folder
 * belongs to the work of that folder and stays a root there, whatever it grew
 * out of. A multi-run lane stays a root as well: the run row owns its lanes.
 *
 * VS Code nests by `parentID` alone. This is display lineage only. OpenCode's `parentID` still decides what the
 * server treats as a subsession (archive cascade on restore, the Archive page).
 */

const openchamberNamespaceSchema = z.object({ openchamber: z.record(z.string(), z.json()) });

const getSessionOriginId = (session: Session): string | null => {
  if (isReviewSession(session)) return getOriginalSessionID(session);
  if (isBtwSession(session) || wasPromotedBtwSession(session)) {
    return getBtwOriginalSessionID(session) ?? (session.fork?.sessionID?.trim() || null);
  }
  return getSideChat(session)?.parentSessionID ?? null;
};

const isMultiRunLane = (session: Session): boolean => Object.hasOwn(
  parseMetadata(openchamberNamespaceSchema, session.metadata).data?.openchamber ?? {},
  'multirun',
);

const sameFolder = (left: Session, right: Session): boolean => {
  const leftDirectory = normalizePath(left.directory ?? null);
  return leftDirectory !== null && leftDirectory === normalizePath(right.directory ?? null);
};

export const resolveSessionNestingParentId = (
  session: Session,
  lookup: (sessionId: string) => Session | undefined,
): string | null => {
  if (session.parentID) return session.parentID;
  if (isVSCodeRuntime() || session.time?.archived || isMultiRunLane(session)) return null;
  const originId = getSessionOriginId(session);
  if (!originId || originId === session.id) return null;
  const origin = lookup(originId);
  if (!origin || origin.time?.archived || !sameFolder(session, origin)) return null;
  const seen = new Set<string>([session.id]);
  let current: Session | undefined = origin;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const next = current.parentID ?? getSessionOriginId(current);
    if (!next) return originId;
    if (seen.has(next)) return next === session.id ? null : originId;
    current = lookup(next);
  }
  return originId;
};
