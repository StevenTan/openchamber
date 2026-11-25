import fs from 'node:fs/promises';
import path from 'node:path';

export function createSessionInstructions(dataDir: string, deliver: {
  put(sessionID: string, directory: string, key: string, text: string): Promise<void>;
  remove(sessionID: string, directory: string, key: string): Promise<void>;
}) {
  const root = path.join(dataDir, 'session-instructions');
  const file = (sessionID: string, key: string) => path.join(root, sessionID, `${encodeURIComponent(key)}.txt`);
  return {
    async put(sessionID: string, directory: string, key: string, text: string) {
      await fs.mkdir(path.join(root, sessionID), { recursive: true });
      await fs.writeFile(file(sessionID, key), text, { mode: 0o600 });
      await deliver.put(sessionID, directory, key, text);
    },
    async remove(sessionID: string, directory: string, key: string) {
      await fs.rm(file(sessionID, key), { force: true });
      await deliver.remove(sessionID, directory, key);
    },
    async read(sessionID: string) {
      let names: string[];
      try { names = await fs.readdir(path.join(root, sessionID)); }
      catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []; throw error; }
      return Promise.all(names.sort().map(async name => ({ text: await fs.readFile(path.join(root, sessionID, name), 'utf8') })));
    },
  };
}
