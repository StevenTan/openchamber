import { z } from 'zod';

import { operatorChildParentId } from '@openchamber/sdk/conversations/operator-child';
export { operatorChildParentId } from '@openchamber/sdk/conversations/operator-child';
import type { Metadata, PermissionRuleset, Session } from '@/lib/opencode/model';
import { withSessionWorkState } from '@/lib/sessionWorkMetadata';

const OPERATOR_CHILD_DENIED_TOOLS = new Set(['question', 'openchamber_secret']);

const openchamberSchema = z.object({ openchamber: z.record(z.string(), z.json()) });

export const isOperatorChildSession = (session: Session | null | undefined): boolean => (
  operatorChildParentId(session?.metadata) !== undefined
);

export const metadataAfterTakeOver = (metadata: Metadata, now: number): Metadata => {
  const { kind: _kind, parentID: _parentID, ...namespace } = openchamberSchema.safeParse(metadata).data?.openchamber ?? {};
  return withSessionWorkState({ ...metadata, openchamber: namespace }, 'open', now);
};

export const permissionsAfterTakeOver = (permissions: PermissionRuleset | undefined): PermissionRuleset => (
  (permissions ?? []).filter((rule) => !(OPERATOR_CHILD_DENIED_TOOLS.has(rule.action) && rule.resource === '*' && rule.effect === 'deny'))
);
