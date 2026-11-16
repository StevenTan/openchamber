export const materializeTurnDiffPlugin = async ({ fsPromises, path, instanceDir }) => {
  const directory = path.join(instanceDir, 'turn-diffs', 'openchamber-turn-diffs');
  await fsPromises.mkdir(directory, { recursive: true });
  await fsPromises.writeFile(path.join(directory, 'package.json'), `${JSON.stringify({ name: 'openchamber-turn-diffs', version: '0.0.0', private: true, type: 'module', exports: { '.': './index.js' } })}\n`, { mode: 0o600 });
  await fsPromises.copyFile(new URL('./plugin.js', import.meta.url), path.join(directory, 'index.js'));
  return directory;
};
