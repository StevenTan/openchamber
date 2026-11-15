interface SleepInput {
  duration_ms: number;
}

interface SleepContext {
  sessionID: string;
  signal: AbortSignal;
}

interface ClockOptions {
  hasPendingInput(sessionID: string, signal: AbortSignal): Promise<boolean>;
}

export function createSleepClock({ hasPendingInput }: ClockOptions) {
  const maximumDuration = 12 * 60 * 60 * 1000;
  const pending = new Map<string, Set<() => void>>();
  const lifetime = new AbortController();

  const sleep = async ({ duration_ms }: SleepInput, context: SleepContext) => {
    if (
      !Number.isInteger(duration_ms) ||
      duration_ms < 1 ||
      duration_ms > maximumDuration
    ) {
      throw new Error(`duration_ms must be between 1 and ${maximumDuration}`);
    }
    const signal = AbortSignal.any([context.signal, lifetime.signal]);
    signal.throwIfAborted();
    const started = performance.now();
    const interrupted = await new Promise<boolean>((resolve, reject) => {
      const query = new AbortController();
      const sleepers = pending.get(context.sessionID) ?? new Set<() => void>();
      pending.set(context.sessionID, sleepers);
      const cleanup = () => {
        if (!sleepers.delete(wake)) return false;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (sleepers.size === 0) pending.delete(context.sessionID);
        query.abort();
        return true;
      };
      const finish = (newInput: boolean) => {
        if (cleanup()) resolve(newInput);
      };
      const wake = () => finish(true);
      const abort = () => {
        if (cleanup()) reject(signal.reason);
      };
      const timer = setTimeout(() => finish(false), duration_ms);
      sleepers.add(wake);
      signal.addEventListener("abort", abort, { once: true });
      void hasPendingInput(context.sessionID, AbortSignal.any([signal, query.signal])).then(
        queued => { if (queued) wake(); },
        error => { if (cleanup()) reject(error); },
      );
    });
    const wallTime = (performance.now() - started) / 1000;
    return {
      content: `Wall time: ${wallTime.toFixed(4)} seconds\n${interrupted ? "Sleep interrupted by new input." : "Sleep completed."}`,
      metadata: { duration_ms, wall_time_seconds: wallTime, interrupted },
    };
  };

  return {
    signal: lifetime.signal,
    tool: {
      name: "sleep",
      description: "Pause execution for a specified duration. Pending input or new input in this session ends the sleep early. Returns elapsed wall-clock time.",
      options: { namespace: "clock", codemode: false },
      input: {
        type: "object",
        properties: {
          duration_ms: {
            type: "integer",
            minimum: 1,
            maximum: maximumDuration,
            description: "How long to sleep in milliseconds.",
          },
        },
        required: ["duration_ms"],
        additionalProperties: false,
      },
      execute: sleep,
    },
    interrupt: (sessionID: string) => {
      for (const wake of pending.get(sessionID) ?? []) wake();
    },
    close: (reason: Error = new Error("Clock plugin unloaded")) => lifetime.abort(reason),
  };
}
