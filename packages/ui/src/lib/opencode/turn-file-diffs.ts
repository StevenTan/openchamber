import type { Part } from './model';

import { turnDiffReferenceSchema, type TurnDiffReference } from '@openchamber/sdk/agent-backends';
export { recordedTurnDiffSchema } from '@openchamber/sdk/agent-backends';

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
  return turnDiffReferences(messages).at(-1);
};

/** A displayed turn can contain several admitted prompts whose messages are hidden. */
export const turnDiffReferences = (messages: readonly { parts: readonly Part[] }[]): TurnDiffReference[] => {
  const references = new Map<string | undefined, TurnDiffReference>();
  for (const message of messages) {
    for (const part of message.parts) {
      const reference = readTurnDiffReference([part]);
      if (reference && (reference.revision ?? Infinity) >= (references.get(reference.turnID)?.revision ?? -1)) references.set(reference.turnID, reference);
    }
  }
  return [...references.values()];
};
