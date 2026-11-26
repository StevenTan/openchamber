import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { recordedTurnDiffSchema } from '@openchamber/sdk/agent-backends';
import type { SqliteConnection, SqliteOpener } from '../message-search/sqlite.js';

interface Storage {
  index: SqliteConnection;
  session<Value>(id: string, work: (db: SqliteConnection) => Value): Value;
  saveDiff(record: z.infer<typeof recordedTurnDiffSchema>): void;
}

export function migrateConversationStorage(dataDir: string, open: SqliteOpener, storage: Storage) {
  for (const backend of ['opencode', 'antigravity']) {
    const file = path.join(dataDir, 'agent-backends', backend, 'history.sqlite');
    if (!fs.existsSync(file)) continue;
    const legacy = open(file);
    try {
      if (backend === 'antigravity') {
        for (const row of legacy.all('SELECT id, data FROM sessions')) storage.index.run('INSERT OR REPLACE INTO sessions(id, backend_id, data) VALUES (?, ?, ?)', [z.string().parse(row.id), backend, z.string().parse(row.data)]);
      }
      const ids = legacy.all(backend === 'antigravity' ? 'SELECT session_id AS id FROM messages UNION SELECT session_id AS id FROM turns' : 'SELECT DISTINCT session_id AS id FROM messages');
      for (const row of ids) {
        const id = z.string().parse(row.id);
        storage.session(id, db => {
          db.run('ATTACH DATABASE ? AS legacy', [file]);
          try {
            db.transaction(() => {
              db.run('INSERT OR REPLACE INTO messages SELECT * FROM legacy.messages WHERE session_id = ?', [id]);
              if (backend === 'antigravity') db.run('INSERT OR REPLACE INTO turns SELECT * FROM legacy.turns WHERE session_id = ?', [id]);
            });
          } finally { db.exec('DETACH DATABASE legacy'); }
        });
      }
    } finally { legacy.close(); }
    fs.unlinkSync(file);
  }
  const diffs = path.join(dataDir, 'turn-diffs');
  if (!fs.existsSync(diffs)) return;
  for (const session of fs.readdirSync(diffs, { withFileTypes: true })) {
    if (!session.isDirectory()) continue;
    const directory = path.join(diffs, session.name);
    for (const name of fs.readdirSync(directory)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(directory, name);
      storage.saveDiff(recordedTurnDiffSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))));
      fs.unlinkSync(file);
    }
  }
}
