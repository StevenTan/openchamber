import { installWorkspaceRuntime, workspaceRuntimeRoot } from './cache.js';

export const materializeWorkspaceDependencies = async ({ fsPromises, path, instanceDir, env }) => {
  const directory = path.join(instanceDir, 'workspace-dependencies');
  const plugin = path.join(directory, 'openchamber-workspace-dependencies');
  const skillsRoot = path.join(directory, 'skills');
  const pdf = path.join(skillsRoot, 'pdf');
  let root;
  let installationError;
  if (env.OPENCHAMBER_WORKSPACE_RUNTIME_DIR) {
    root = path.resolve(env.OPENCHAMBER_WORKSPACE_RUNTIME_DIR);
  } else if (env.OPENCHAMBER_WORKSPACE_RUNTIME_PAYLOAD_DIR) {
    try {
      root = await installWorkspaceRuntime(env.OPENCHAMBER_WORKSPACE_RUNTIME_PAYLOAD_DIR);
    } catch (error) {
      installationError = error instanceof Error ? error.message : String(error);
      console.error('[workspace] Runtime installation failed:', error);
    }
  } else {
    root = workspaceRuntimeRoot();
  }
  await fsPromises.mkdir(plugin, { recursive: true });
  await fsPromises.mkdir(pdf, { recursive: true });
  await fsPromises.writeFile(path.join(plugin, 'package.json'), JSON.stringify({ name: 'openchamber-workspace-dependencies', type: 'module', main: './index.js' }));
  await fsPromises.copyFile(new URL('./dist/plugin.js', import.meta.url), path.join(plugin, 'index.js'));
  await fsPromises.writeFile(path.join(plugin, 'runtime-root.json'), JSON.stringify({ root, installationError }));
  await fsPromises.copyFile(new URL('./pdf-skill.txt', import.meta.url), path.join(pdf, 'SKILL.md'));
  return { plugin, skillsRoot };
};
