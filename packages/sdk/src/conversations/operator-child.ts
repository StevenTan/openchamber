import { z } from 'zod';
import { parseMetadata } from './metadata.js';
import type { Metadata } from './model.js';

const operatorChildLinkSchema = z.object({
  openchamber: z.object({ kind: z.literal('operator-child'), parentID: z.string().min(1) }),
});

export const operatorChildParentId = (metadata: Metadata | undefined): string | undefined => (
  parseMetadata(operatorChildLinkSchema, metadata).data?.openchamber.parentID
);

