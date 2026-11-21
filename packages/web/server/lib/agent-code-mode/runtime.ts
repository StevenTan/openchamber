import fs from 'node:fs/promises';
import path from 'node:path';

export const materializeCodeModePlugin = async (instanceDir: string) => {
  const directory = path.join(instanceDir, 'agent-code-mode', 'openchamber-code-mode');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'openchamber-code-mode', type: 'module', main: './index.js' }));
  const temporary = path.join(directory, `index.js.tmp-${process.pid}-${Date.now()}`);
  try {
    await fs.copyFile(new URL('./dist/plugin.js', import.meta.url), temporary);
    await fs.rename(temporary, path.join(directory, 'index.js'));
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return directory;
};
