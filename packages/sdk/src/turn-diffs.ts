import { z } from 'zod';

const fileStats = z.object({
  file: z.string(),
  status: z.enum(['added', 'deleted', 'modified']),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  error: z.string().optional(),
});
export const turnDiffReferenceSchema = z.object({
  turnID: z.string().optional(),
  revision: z.number().optional(),
  files: z.array(fileStats).optional(),
  error: z.string().optional(),
});
export const recordedTurnDiffSchema = z.object({
  version: z.literal(1),
  sessionID: z.string(),
  turnID: z.string(),
  revision: z.number().optional(),
  files: z.array(fileStats.extend({ patch: z.string().optional() })).optional(),
  error: z.string().optional(),
  unavailable: z.boolean().optional(),
  directory: z.string().optional(),
});
export type TurnDiffReference = z.infer<typeof turnDiffReferenceSchema>;
