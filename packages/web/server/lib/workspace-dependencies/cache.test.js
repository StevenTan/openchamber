import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { installWorkspaceRuntime, workspaceRuntimeRoot } from './cache.js';

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

async function bundle({ fingerprint = 'a'.repeat(64), incomplete = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace bundle 中文 '));
  directories.push(directory);
  const payload = path.join(directory, 'payload');
  const source = path.join(directory, 'source');
  const cache = path.join(directory, 'cache');
  await fs.mkdir(payload);
  await fs.mkdir(source);
  const manifest = { bundleFormatVersion: 1, bundleVersion: 'fixture', fingerprint, targetPlatform: process.platform, targetArch: process.arch, pythonVersion: '3.12.16', packages: { pypdf: '6.21.4' }, popplerVersion: '26.06.0' };
  await fs.writeFile(path.join(source, 'runtime.json'), JSON.stringify(manifest));
  const windows = process.platform === 'win32';
  const files = [
    windows ? 'dependencies/python/python.exe' : 'dependencies/python/bin/python3',
    `dependencies/bin/override/pdftoppm${windows ? '.cmd' : ''}`,
    `dependencies/bin/override/pdfinfo${windows ? '.cmd' : ''}`,
    `dependencies/native/poppler/poppler-utils${windows ? '.exe' : ''}`,
    'dependencies/native/poppler/fonts.conf',
  ];
  for (const file of incomplete ? files.slice(1) : files) {
    const target = path.join(source, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'fixture', { mode: 0o755 });
  }
  const archive = path.join(payload, 'runtime.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', source, '.']);
  manifest.sha256 = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
  await fs.writeFile(path.join(payload, 'bundle.json'), JSON.stringify(manifest));
  return { directory, payload, archive, cache, manifest, root: workspaceRuntimeRoot(fingerprint, cache) };
}

it('installs once into a writable cache and reuses it across processes', async () => {
  const fixture = await bundle();
  expect(await installWorkspaceRuntime(fixture.payload, fixture.cache)).toBe(fixture.root);
  await fs.writeFile(path.join(fixture.root, 'python-cache'), 'writable');
  await fs.rm(fixture.archive);
  const module = new URL('./cache.js', import.meta.url).href;
  const code = `import {installWorkspaceRuntime} from ${JSON.stringify(module)}; console.log(await installWorkspaceRuntime(process.argv[1],process.argv[2]));`;
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', code, fixture.payload, fixture.cache], { encoding: 'utf8' });
  expect(result.trim()).toBe(fixture.root);
  expect(await fs.readFile(path.join(fixture.root, 'python-cache'), 'utf8')).toBe('writable');
});

it('publishes a complete bundle when installers run concurrently', async () => {
  const fixture = await bundle();
  const copy = path.join(fixture.directory, 'second-payload');
  await fs.cp(fixture.payload, copy, { recursive: true });
  const roots = await Promise.all([installWorkspaceRuntime(fixture.payload, fixture.cache), installWorkspaceRuntime(copy, fixture.cache)]);
  expect(roots).toEqual([fixture.root, fixture.root]);
  expect(await fs.readdir(path.dirname(fixture.root))).toEqual(['openchamber-primary-runtime']);
});

it('rejects a damaged archive before publishing any runtime', async () => {
  const fixture = await bundle();
  await fs.appendFile(fixture.archive, 'damaged');
  await expect(installWorkspaceRuntime(fixture.payload, fixture.cache)).rejects.toThrow('SHA256 mismatch');
  await expect(fs.access(fixture.root)).rejects.toThrow();
});

it('preserves an installed version when a new payload is incomplete', async () => {
  const current = await bundle();
  await installWorkspaceRuntime(current.payload, current.cache);
  const next = await bundle({ fingerprint: 'b'.repeat(64), incomplete: true });
  await expect(installWorkspaceRuntime(next.payload, current.cache)).rejects.toThrow('ENOENT');
  expect(JSON.parse(await fs.readFile(path.join(current.root, 'runtime.json'), 'utf8')).fingerprint).toBe(current.manifest.fingerprint);
  expect(await fs.readdir(path.dirname(workspaceRuntimeRoot(next.manifest.fingerprint, current.cache)))).toEqual([]);
});

it('gives host architectures distinct runtime directories', () => {
  expect(workspaceRuntimeRoot('a'.repeat(64), '/cache', 'darwin', 'arm64')).not.toBe(workspaceRuntimeRoot('a'.repeat(64), '/cache', 'darwin', 'x64'));
});

it('rejects bundles for another host architecture', async () => {
  const fixture = await bundle();
  fixture.manifest.targetArch = process.arch === 'arm64' ? 'x64' : 'arm64';
  await fs.writeFile(path.join(fixture.payload, 'bundle.json'), JSON.stringify(fixture.manifest));
  await expect(installWorkspaceRuntime(fixture.payload, fixture.cache)).rejects.toThrow('this host is');
});

it('materializes a packaged plugin without access to build scripts', async () => {
  const fixture = await bundle();
  const packageRoot = path.join(fixture.directory, 'packaged');
  const packaged = path.join(packageRoot, 'server', 'lib', 'workspace-dependencies');
  await fs.mkdir(path.join(packaged, 'dist'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@openchamber/web', type: 'module', main: './server/index.js', bin: { openchamber: './bin/cli.js' },
  }));
  await fs.copyFile(new URL('../web-package-paths.js', import.meta.url), path.join(packaged, '..', 'web-package-paths.js'));
  for (const file of ['runtime.js', 'cache.js', 'pdf-skill.txt', 'dist/plugin.js']) {
    await fs.copyFile(new URL(file, import.meta.url), path.join(packaged, file));
  }
  const code = `
    import fs from 'node:fs/promises';
    import path from 'node:path';
    import {pathToFileURL} from 'node:url';
    const {materializeWorkspaceDependencies} = await import(pathToFileURL(process.argv[1]));
    const result = await materializeWorkspaceDependencies({fsPromises:fs,path,instanceDir:process.argv[2],env:{OPENCHAMBER_WORKSPACE_RUNTIME_PAYLOAD_DIR:process.argv[3]}});
    const {default:plugin} = await import(pathToFileURL(path.join(result.plugin,'index.js')));
    let tool;
    await plugin.setup({tool:{transform:async update=>update({add:value=>{tool=value}})}});
    try { console.log(JSON.stringify(await tool.execute({}))); }
    catch(error) { console.log(JSON.stringify({error:error.message})); }
  `;
  const options = { encoding: 'utf8', env: { ...process.env, HOME: fixture.directory, USERPROFILE: fixture.directory } };
  const args = ['--input-type=module', '-e', code, path.join(packaged, 'runtime.js'), path.join(fixture.directory, 'instance'), fixture.payload];
  const first = JSON.parse(execFileSync(process.execPath, args, options));
  expect(first.error).toBeUndefined();
  expect(first.output.python.executable).toContain(path.join(fixture.directory, '.cache', 'openchamber-runtimes'));
  await fs.writeFile(path.join(fixture.payload, 'bundle.json'), '{}');
  const failed = JSON.parse(execFileSync(process.execPath, args, options));
  expect(failed.error).toContain('installation failed: Invalid workspace runtime bundle manifest');
});
