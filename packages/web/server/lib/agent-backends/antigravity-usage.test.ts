import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readAntigravityUsage } from './antigravity-usage.js';

test('native usage reads the latest generation and totals without creating a missing database', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agy-usage-'));
  const file = path.join(directory, 'conversation.db');
  try {
    assert.equal(readAntigravityUsage(file), undefined);
    assert.equal(existsSync(file), false);
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)');
    const insert = db.prepare('INSERT INTO gen_metadata VALUES (?, ?)');
    insert.run(0, Uint8Array.from([10, 18, 34, 10, 16, 1, 24, 3, 32, 0, 40, 9, 72, 1, 74, 4, 82, 2, 32, 64]));
    insert.run(1, Uint8Array.from([10, 18, 34, 10, 16, 5, 24, 4, 32, 2, 40, 23, 72, 2, 74, 4, 82, 2, 32, 64]));
    insert.run(2, new Uint8Array());
    db.close();
    assert.deepEqual(readAntigravityUsage(file), {
      tokens: { input: 5, output: 4, reasoning: 2, cache: { read: 23, write: 2 } },
      context: { used: 30, limit: 64 },
      sessionTokens: { input: 6, output: 7, reasoning: 3, cache: { read: 32, write: 2 } },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
