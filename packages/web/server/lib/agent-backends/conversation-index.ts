import { z } from 'zod';
import type { Session, Metadata } from '@openchamber/sdk/conversations/model';
import type { SessionPatch, SyncEvent } from '@openchamber/sdk/conversations/events';
import type { SessionListOptions, SessionPage } from '@openchamber/sdk/conversations/http';
import { withSessionMetadata } from '@openchamber/sdk/conversations/opencode';
import type { SqliteConnection } from '../message-search/sqlite.js';
import type { SQLInputValue } from 'node:sqlite';
import type { BackendID } from './contracts.js';

const cursorSchema = z.object({ updated: z.number(), id: z.string(), order: z.enum(['asc', 'desc']) });
type Owned = { title?: string; archived?: number | null; metadata?: Metadata | null };
export type ConversationListing = SessionListOptions & { backendID?: BackendID | undefined; archived?: boolean | undefined; project?: string | undefined; subpath?: string | undefined };

function overlay(session: Session, owned: Owned): Session {
  const result = { ...session, time: { ...session.time } };
  if (owned.title !== undefined) result.title = owned.title;
  if ('archived' in owned) {
    if (owned.archived == null) delete result.time.archived;
    else result.time.archived = owned.archived;
  }
  if ('metadata' in owned) return withSessionMetadata(result, owned.metadata ?? {});
  return result;
}

function patchSession(session: Session, patch: SessionPatch): Session {
  const { subpath, revert, time, metadata, outcome, ...fields } = patch;
  const { archived, ...timestamps } = time ?? {};
  const result: Session = { ...session, ...fields, time: { ...session.time, ...timestamps } };
  if (outcome !== undefined) result.outcome = outcome;
  if (archived === null) delete result.time.archived;
  else if (archived !== undefined) result.time.archived = archived;
  if (subpath === null) delete result.subpath;
  else if (subpath !== undefined) result.subpath = subpath;
  if (revert === null) delete result.revert;
  else if (revert !== undefined) result.revert = revert;
  return metadata === undefined ? result : withSessionMetadata(result, metadata);
}

export function createConversationIndex(db: SqliteConnection) {
  db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, backend_id TEXT NOT NULL, native_id TEXT NOT NULL,
    data TEXT NOT NULL, owned TEXT NOT NULL DEFAULT '{}', draft INTEGER NOT NULL DEFAULT 0,
    directory TEXT GENERATED ALWAYS AS (json_extract(data, '$.directory')) VIRTUAL,
    parent_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.parentID')) VIRTUAL,
    updated INTEGER GENERATED ALWAYS AS (json_extract(data, '$.time.updated')) VIRTUAL
  );
  CREATE INDEX IF NOT EXISTS conversation_order ON conversations(draft, updated, id);
  CREATE INDEX IF NOT EXISTS conversation_directory ON conversations(directory, draft, updated, id);
  CREATE INDEX IF NOT EXISTS conversation_parent ON conversations(parent_id, updated, id);`);
  const get = (id: string): Session | undefined => {
    const row = db.get('SELECT data FROM conversations WHERE id = ?', [id]);
    return row ? JSON.parse(z.string().parse(row.data)) : undefined;
  };
  const owned = (id: string): Owned => {
    const row = db.get('SELECT owned FROM conversations WHERE id = ?', [id]);
    return row ? JSON.parse(z.string().parse(row.owned)) : {};
  };
  const save = (session: Session, backendID: BackendID, nativeID?: string, draft = false): Session => {
    const info = overlay({ ...session, backendID }, owned(session.id));
    db.run(`INSERT INTO conversations(id, backend_id, native_id, data, draft) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET native_id = COALESCE(?, conversations.native_id), data = excluded.data, draft = excluded.draft`,
    [info.id, backendID, nativeID ?? info.id, JSON.stringify(info), Number(draft), nativeID ?? null]);
    return info;
  };
  const project = (event: SyncEvent): SyncEvent => {
    if (event.type === 'session.created') return { ...event, properties: { info: overlay(event.properties.info, owned(event.properties.info.id)) } };
    if (event.type !== 'session.patched') return event;
    const { sessionID, patch } = event.properties;
    const fields = owned(sessionID);
    return { ...event, properties: { sessionID, patch: { ...patch,
      ...fields.title !== undefined && { title: fields.title },
      ...'metadata' in fields && { metadata: fields.metadata ?? {} },
      ...'archived' in fields && { time: { ...patch.time, archived: fields.archived ?? null } },
    } } };
  };
  return {
    get, save, project,
    owners: (): Array<[string, BackendID]> => db.all('SELECT id, backend_id FROM conversations').map(row => [z.string().parse(row.id), z.enum(['opencode', 'antigravity']).parse(row.backend_id)]),
    change(id: string, session: Session, fields: Owned): Session {
      const next = { ...owned(id), ...fields };
      const info = overlay(session, next);
      db.run('UPDATE conversations SET data = ?, owned = ? WHERE id = ?', [JSON.stringify(info), JSON.stringify(next), id]);
      return info;
    },
    list(input: ConversationListing): SessionPage {
      const position = input.cursor ? cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString())) : undefined;
      const order = position?.order ?? input.order ?? 'desc';
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      const where = ["draft = 0", "COALESCE(json_extract(data, '$.metadata.hidden'), 0) = 0"];
      const params: SQLInputValue[] = [];
      for (const [column, value] of [['backend_id', input.backendID], ['directory', input.global ? undefined : input.directory], ["json_extract(data, '$.projectID')", input.project], ["json_extract(data, '$.subpath')", input.subpath]]) {
        if (value != null) { where.push(`${column} = ?`); params.push(value); }
      }
      if (input.parentID === null) where.push('parent_id IS NULL');
      else if (input.parentID !== undefined) { where.push('parent_id = ?'); params.push(input.parentID); }
      if (input.archived !== undefined) where.push(`json_extract(data, '$.time.archived') IS ${input.archived ? 'NOT ' : ''}NULL`);
      if (input.search) { where.push("instr(lower(json_extract(data, '$.title')), lower(?)) > 0"); params.push(input.search); }
      if (position) { where.push(`(updated, id) ${order === 'asc' ? '>' : '<'} (?, ?)`); params.push(position.updated, position.id); }
      const limit = input.limit ?? 100;
      const rows = db.all(`SELECT data FROM conversations WHERE ${where.join(' AND ')} ORDER BY updated ${direction}, id ${direction} LIMIT ?`, [...params, limit + 1]);
      const sessions: Session[] = rows.slice(0, limit).map(row => JSON.parse(z.string().parse(row.data)));
      const last = sessions.at(-1);
      return { sessions, cursor: last && rows.length > limit ? { next: Buffer.from(JSON.stringify({ updated: last.time.updated, id: last.id, order })).toString('base64url') } : {} };
    },
    record(event: SyncEvent): SyncEvent {
      if (event.type === 'session.created') return { ...event, properties: { info: save(event.properties.info, z.enum(['opencode', 'antigravity']).parse(event.properties.info.backendID)) } };
      if (event.type === 'session.deleted') db.run('DELETE FROM conversations WHERE id = ?', [event.properties.sessionID]);
      if (event.type !== 'session.patched') return event;
      const { sessionID, patch } = event.properties;
      const current = get(sessionID);
      if (!current) return event;
      save(patchSession(current, patch), z.enum(['opencode', 'antigravity']).parse(current.backendID));
      return project(event);
    },
  };
}
export type ConversationIndex = ReturnType<typeof createConversationIndex>;
