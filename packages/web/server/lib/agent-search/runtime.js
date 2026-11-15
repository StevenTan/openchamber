import fs from 'node:fs/promises';
import path from 'node:path';

export const materializeSearchPlugin = async (instanceDir) => {
  const directory = path.join(instanceDir, 'agent-search', 'openchamber-search-tool');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'openchamber-search-tool', type: 'module', main: './index.js' }));
  const temporary = path.join(directory, `index.js.tmp-${process.pid}-${Date.now()}`);
  try {
    await fs.copyFile(new URL('./dist/plugin.js', import.meta.url), temporary);
    await fs.rename(temporary, path.join(directory, 'index.js'));
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return directory;
};
