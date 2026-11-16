import { z } from 'zod';
import type { Part } from './model';

const fileStats = z.object({
  file: z.string(),
  status: z.enum(['added', 'deleted', 'modified']),
  additions: z.number().optional(),
  deletions: z.number().optional(),
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
});
const turnDiffReferenceSchema = z.object({
  turnID: z.string().optional(),
  revision: z.number().optional(),
  files: z.array(fileStats).optional(),
  error: z.string().optional(),
});
type TurnDiffReference = z.infer<typeof turnDiffReferenceSchema>;

const readTurnDiffReference = (parts: readonly Part[]): TurnDiffReference | undefined => {
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (part.type !== 'tool' || !('metadata' in part.state)) continue;
    const value = turnDiffReferenceSchema.safeParse(part.state.metadata?.openchamberTurnDiff);
    if (value.success) return value.data;
  }
  return undefined;
};

export const latestTurnDiffReference = (messages: readonly { parts: readonly Part[] }[]): TurnDiffReference | undefined => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const reference = readTurnDiffReference(messages[index].parts);
    if (reference) return reference;
  }
  return undefined;
};

/** A displayed turn can contain several admitted prompts whose messages are hidden. */
export const turnDiffReferences = (messages: readonly { parts: readonly Part[] }[]): TurnDiffReference[] => {
  const references = new Map<string | undefined, TurnDiffReference>();
  for (const message of messages) {
    for (const part of message.parts) {
      const reference = readTurnDiffReference([part]);
      if (reference) references.set(reference.turnID, reference);
    }
  }
  return [...references.values()];
};
