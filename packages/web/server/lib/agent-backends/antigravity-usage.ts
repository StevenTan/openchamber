import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { AcpTokenUsage } from '@openchamber/sdk/agent-backends';
import { parseProto } from './vendor/protobuf.js';

const metadataRow = z.object({ data: z.instanceof(Uint8Array) });
const emptyTokens = (): AcpTokenUsage => ({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } });
const nested = (fields: Map<number, number | Uint8Array>, key: number) => parseProto(z.instanceof(Uint8Array).parse(fields.get(key) ?? new Uint8Array()));
const count = (fields: Map<number, number | Uint8Array>, key: number) => z.number().parse(fields.get(key) ?? 0);

export function readAntigravityUsage(dbPath: string) {
  if (!existsSync(dbPath)) return undefined;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const sessionTokens = emptyTokens();
    let latest: { tokens: AcpTokenUsage; context: { used: number; limit: number } } | undefined;
    for (const row of db.prepare('SELECT data FROM gen_metadata ORDER BY idx').iterate()) {
      const chat = nested(parseProto(metadataRow.parse(row).data), 1);
      const usage = nested(chat, 4);
      const tokens = { input: count(usage, 2), output: count(usage, 3), reasoning: count(usage, 9), cache: { write: count(usage, 4), read: count(usage, 5) } };
      sessionTokens.input += tokens.input;
      sessionTokens.output += tokens.output;
      sessionTokens.reasoning += tokens.reasoning;
      sessionTokens.cache.read += tokens.cache.read;
      sessionTokens.cache.write += tokens.cache.write;
      if (tokens.input + tokens.cache.read + tokens.cache.write > 0) latest = { tokens, context: { used: tokens.input + tokens.cache.read + tokens.cache.write, limit: count(nested(nested(chat, 9), 10), 4) } };
    }
    return latest && { ...latest, sessionTokens };
  } finally {
    db.close();
  }
}
