import type { z } from "zod";
import type { commandTools } from "./contracts.js";

type JsonValue = z.infer<typeof commandTools.store.input>["value"];

export function createSessionMemory() {
  const sessions = new Map<string, Map<string, JsonValue>>();
  return {
    store({ key, value }: { key: string; value: JsonValue }, sessionID: string) {
      let values = sessions.get(sessionID);
      if (!values) {
        values = new Map();
        sessions.set(sessionID, values);
      }
      values.set(key, structuredClone(value));
      return { key };
    },
    load({ key }: { key: string }, sessionID: string) {
      const value = sessions.get(sessionID)?.get(key);
      if (value === undefined) throw new Error(`No stored value for key '${key}' in this session.`);
      return { value: structuredClone(value) };
    },
    clear(sessionID: string) { sessions.delete(sessionID); },
    clearAll() { sessions.clear(); },
  };
}
