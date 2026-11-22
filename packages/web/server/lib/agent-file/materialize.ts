import fs from 'node:fs/promises';
import path from 'node:path';

export async function materializeFilePlugin(instanceDir: string) {
  const directory = path.join(instanceDir, 'agent-file', 'openchamber-file-tools');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'openchamber-file-tools', type: 'module', main: './index.js' }));
  await fs.copyFile(new URL('./dist/plugin.js', import.meta.url), path.join(directory, 'index.js'));
  return directory;
}
