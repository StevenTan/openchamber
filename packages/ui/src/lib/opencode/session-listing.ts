import type { OpenCodeClient } from '@opencode/client';
import { z } from 'zod';
import type { AcpSessionAdapter } from '../agent-backends/client';
import { projectBackendSession } from '../agent-backends/model';
import { isVSCodeRuntime } from '../desktop';
import { isSpaceDirectory } from '../spaces/space-route';
import { spaceMarkSchema, type SpaceMark } from '../spaces/spaces-store';
import { compact, type Session, type Message, type Part } from './model';
import { projectSession, toOpenCodeDirectory } from './projection';
import type { normalizeOpencodeError } from './client';

export type SessionPage = {
  sessions: Session[];
  cursor: { previous?: string; next?: string };
  spaces?: SpaceMark[];
};

export type SessionListOptions = {
  directory?: string | null;
  global?: boolean;
  limit?: number;
  order?: 'asc' | 'desc';
  search?: string;
  cursor?: string;
  parentID?: string | null;
};

export type MessagePage = {
  items: Array<{ info: Message; parts: Part[] }>
  cursor: { previous?: string; next?: string }
}

export const pageCursor = (cursor: { previous?: string | null; next?: string | null }) =>
  compact({ previous: cursor.previous ?? undefined, next: cursor.next ?? undefined })

const sessionPageSpacesSchema = z.object({ spaces: z.array(spaceMarkSchema).optional() });
const DEFAULT_SESSION_PAGE_LIMIT = 100;

export async function readSessionPage(
  client: OpenCodeClient,
  directory: string | undefined,
  options: SessionListOptions,
  backend: AcpSessionAdapter,
  normalizeError: typeof normalizeOpencodeError,
): Promise<SessionPage> {
  let response: Awaited<ReturnType<OpenCodeClient['session']['list']>>;
  try {
    response = await client.session.list({
      directory: directory ? toOpenCodeDirectory(directory) : undefined,
      limit: options.limit ?? DEFAULT_SESSION_PAGE_LIMIT,
      order: options.order,
      search: options.search,
      cursor: options.cursor,
      parentID: options.parentID,
    });
  } catch (error) {
    throw normalizeError('session.list', error);
  }
  const spaces = options.global ? sessionPageSpacesSchema.safeParse(response).data?.spaces : undefined;
  const additional = !options.cursor && !isVSCodeRuntime() && !isSpaceDirectory(directory)
    ? (await backend.snapshot(directory)).sessions
      .filter(() => options.parentID === undefined || options.parentID === null)
      .filter(session => !options.search || session.title.toLowerCase().includes(options.search.toLowerCase()))
      .map(projectBackendSession)
    : [];
  return {
    sessions: [...response.data.map(projectSession), ...additional],
    cursor: pageCursor(response.cursor),
    ...(spaces ? { spaces } : {}),
  };
}
