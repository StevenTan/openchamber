// Adapted from OpenCode v2.3.2, https://github.com/anomalyco/opencode. MIT; see LICENSE.txt.
import { Effect, Semaphore } from 'effect';

export function makeFileLocks() {
  const locks = new Map<string, { semaphore: Semaphore.Semaphore; users: number }>();
  return (key: string) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.suspend(() => {
    const current = locks.get(key);
    const entry = current ?? { semaphore: Semaphore.makeUnsafe(1), users: 0 };
    if (!current) locks.set(key, entry);
    entry.users++;
    return entry.semaphore.withPermit(effect).pipe(Effect.ensuring(Effect.sync(() => {
      entry.users--;
      if (entry.users === 0) locks.delete(key);
    })));
  });
}
