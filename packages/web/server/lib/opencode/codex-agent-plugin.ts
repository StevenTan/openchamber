export const materializeCodexAgentPlugin = async ({ fsPromises, path, instanceDir }: { fsPromises: typeof import('node:fs/promises'); path: typeof import('node:path'); instanceDir: string }) => {
  const prompt = await fsPromises.readFile(new URL('./codex-agent-prompt.txt', import.meta.url), 'utf8');
  const directory = path.join(instanceDir, 'codex-agent', 'openchamber-codex-agent');
  const source = `export default {
  id: 'openchamber-codex-agent',
  async setup(ctx) {
    await ctx.agent.transform(editor => {
      editor.update('Codex-默认', agent => {
        agent.mode = 'all'
        agent.system = ${JSON.stringify(prompt)}
      })
    })
  },
}
`;
  await fsPromises.mkdir(directory, { recursive: true });
  await fsPromises.writeFile(path.join(directory, 'package.json'), JSON.stringify({
    name: 'openchamber-codex-agent', type: 'module', main: './index.js',
  }), { mode: 0o600 });
  await fsPromises.writeFile(path.join(directory, 'index.js'), source, { mode: 0o600 });
  return directory;
};
