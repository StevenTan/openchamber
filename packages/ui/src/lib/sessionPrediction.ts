import { z } from 'zod';

export const SESSION_PREDICTION_PROMPT = [
  'This is an app-generated request for a suggested next user message. The user did not write this message.',
  "Your suggestion will appear in the user's empty message composer. They can accept it, edit it, or ignore it; it will not be sent automatically.",
  "Predict the single message this user is most likely to type next from the visible conversation. Use the whole conversation to understand their current intent and the latest exchange. Choose the action and specific object that best continue that intent, rather than a generally useful follow-up. Express its core naturally in the user's voice, keeping the requirements needed to retain its meaning. Choose the strongest grounded move even if several continuations are possible; uncertainty about exact wording or incidental details is not a reason to return null. Use null only when the conversation offers no grounded next move at all.",
  'Set suggestion to exactly one natural user message, one line, at most 240 characters, or null. No alternatives or explanation.',
  'Return only JSON matching this schema: {"type":"object","properties":{"suggestion":{"anyOf":[{"type":"string"},{"type":"null"}]}},"required":["suggestion"],"additionalProperties":false}.',
].join('\n\n');

const predictionSchema = z.object({ suggestion: z.string().trim().max(240).nullable() });
const CACHE_LIMIT = 64;

export interface PredictionTarget {
  key: string;
  revision: number;
  sessionID: string;
  directory: string;
}

type PredictionSnapshot =
  | { status: 'pending'; text: null }
  | { status: 'ready'; text: string | null }
  | { status: 'error'; text: null };

type Entry = {
  revision: number;
  controller: AbortController;
  snapshot: PredictionSnapshot;
};

/** One shared request per session boundary, including empty and dismissed results. */
export function createSessionPredictionCache(
  generate: (target: PredictionTarget, signal: AbortSignal) => Promise<string>,
) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const trim = () => {
    for (const [key, entry] of entries) {
      if (entries.size <= CACHE_LIMIT) break;
      if (entry.snapshot.status !== 'pending') entries.delete(key);
    }
  };

  const invalidate = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    entry.controller.abort();
    entries.delete(key);
    notify();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get(key: string, revision: number) {
      const entry = entries.get(key);
      return entry?.revision === revision ? entry.snapshot : null;
    },
    async load(target: PredictionTarget) {
      if (entries.get(target.key)?.revision === target.revision) return;
      invalidate(target.key);
      const entry: Entry = { revision: target.revision, controller: new AbortController(), snapshot: { status: 'pending', text: null } };
      entries.set(target.key, entry);
      trim();
      notify();
      try {
        const response = await generate(target, entry.controller.signal);
        if (entry.controller.signal.aborted || entries.get(target.key) !== entry) return;
        const suggestion = response.trim() ? predictionSchema.parse(JSON.parse(response)).suggestion : null;
        entry.snapshot = { status: 'ready', text: suggestion || null };
        trim();
        notify();
      } catch (error) {
        if (entry.controller.signal.aborted || entries.get(target.key) !== entry) return;
        entry.snapshot = { status: 'error', text: null };
        trim();
        console.warn('[session-prediction] request failed', { error: error instanceof Error ? error.name : 'RequestError' });
        notify();
      }
    },
    dismiss(key: string, revision: number) {
      const entry = entries.get(key);
      if (!entry || entry.revision !== revision) return;
      entry.controller.abort();
      entry.snapshot = { status: 'ready', text: null };
      notify();
    },
    invalidate,
    clear() {
      if (!entries.size) return;
      for (const entry of entries.values()) entry.controller.abort();
      entries.clear();
      notify();
    },
  };
}
