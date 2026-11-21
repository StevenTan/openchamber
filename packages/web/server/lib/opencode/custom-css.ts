import { createFolderChangeWatch } from '../fs/folder-change-watch.js';
import { isMissingFileError } from '../share-pages/file-errors.js';
import type { Application } from '../shared/http-contracts.js';

export const CUSTOM_CSS_MAX_BYTES = 512 * 1024;

export const registerCustomCss = ({ app, fsPromises, path, dataDir, onChange, pollMs = 1000 }: { app: Application; fsPromises: typeof import('node:fs/promises'); path: typeof import('node:path'); dataDir: string; onChange: () => void; pollMs?: number }) => {
  const filePath = path.join(dataDir, 'custom.css');
  app.get('/api/config/custom-css', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let file;
    try {
      file = await fsPromises.open(filePath, 'r');
      const stat = await file.stat();
      if (!stat.isFile()) return res.status(400).json({ error: 'custom.css must be a regular file' });
      const buffer = Buffer.alloc(CUSTOM_CSS_MAX_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > CUSTOM_CSS_MAX_BYTES) return res.status(413).json({ error: 'custom.css exceeds 512 KiB' });
      return res.json({ css: buffer.toString('utf8', 0, length) });
    } catch (error) {
      if (isMissingFileError(error)) return res.json({ css: '' });
      return res.status(500).json({ error: 'Could not read custom.css' });
    } finally {
      await file?.close();
    }
  });

  return createFolderChangeWatch({
    root: dataDir,
    pollMs,
    onChange,
    fingerprint: async () => {
      try {
        const stat = await fsPromises.stat(filePath);
        return `${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
      } catch (error) {
        if (isMissingFileError(error)) return 'missing';
        throw error;
      }
    },
  });
};
