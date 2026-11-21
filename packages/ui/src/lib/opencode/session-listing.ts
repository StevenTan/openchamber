import type { OpenCodeClient } from '@opencode/client';
import { z } from 'zod';
import { spaceMarkSchema } from '../spaces/spaces-store';
import { compact } from './model';
import { projectSession, toOpenCodeDirectory } from './projection';
import type { normalizeOpencodeError } from './client';

import type { SessionPage, SessionListOptions} from "../agent/client"
export type { SessionPage, SessionListOptions, MessagePage } from "../agent/client"

export const pageCursor = (cursor: { previous?: string | null; next?: string | null }) =>
  compact({ previous: cursor.previous ?? undefined, next: cursor.next ?? undefined })

const sessionPageSpacesSchema = z.object({ spaces: z.array(spaceMarkSchema).optional() });
const DEFAULT_SESSION_PAGE_LIMIT = 100;

export async function readSessionPage(
  client: OpenCodeClient,
  directory: string | undefined,
  options: SessionListOptions,
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
  return {
    sessions: response.data.map(projectSession),
    cursor: pageCursor(response.cursor),
    ...(spaces ? { spaces } : {}),
  };
}
