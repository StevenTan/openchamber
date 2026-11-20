import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { webPackagePaths } from '../web-package-paths.js';

const run = promisify(execFile);
const installations = new Map();

export function runtimeFingerprint() {
  const digest = createHash('sha256');
  const sourceDirectory = path.join(webPackagePaths.root, 'server', 'lib', 'workspace-dependencies');
  for (const file of ['./runtime-spec.json', './requirements.txt', './poppler-notices.txt', './cache.js', '../../../scripts/prepare-workspace-runtime.mjs']) {
    digest.update(fs.readFileSync(path.resolve(sourceDirectory, file)));
  }
  return digest.digest('hex');
}

export function workspaceRuntimeRoot(fingerprint = runtimeFingerprint(), cacheRoot = path.join(os.homedir(), '.cache', 'openchamber-runtimes'), platform = process.platform, arch = process.arch) {
  return path.join(cacheRoot, `${platform}-${arch}`, fingerprint, 'openchamber-primary-runtime');
}

async function validateRuntime(root, manifest) {
  const info = JSON.parse(await fsp.readFile(path.join(root, 'runtime.json'), 'utf8'));
  for (const field of ['bundleFormatVersion', 'bundleVersion', 'fingerprint', 'targetPlatform', 'targetArch']) {
    if (info[field] !== manifest[field]) throw new Error(`Workspace runtime ${field} does not match its bundle.`);
  }
  const windows = process.platform === 'win32';
  for (const file of [
    windows ? 'dependencies/python/python.exe' : 'dependencies/python/bin/python3',
    `dependencies/bin/override/pdftoppm${windows ? '.cmd' : ''}`,
    `dependencies/bin/override/pdfinfo${windows ? '.cmd' : ''}`,
    `dependencies/native/poppler/poppler-utils${windows ? '.exe' : ''}`,
  ]) await fsp.access(path.join(root, file), windows ? fs.constants.F_OK : fs.constants.X_OK);
  await fsp.access(path.join(root, 'dependencies/native/poppler/fonts.conf'));
}

async function installBundle(payloadDirectory, cacheRoot) {
  const manifest = JSON.parse(await fsp.readFile(path.join(payloadDirectory, 'bundle.json'), 'utf8'));
  if (manifest.bundleFormatVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.fingerprint) || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error('Invalid workspace runtime bundle manifest.');
  }
  if (manifest.targetPlatform !== process.platform || manifest.targetArch !== process.arch) {
    throw new Error(`Workspace runtime bundle targets ${manifest.targetPlatform}/${manifest.targetArch}; this host is ${process.platform}/${process.arch}.`);
  }
  const root = workspaceRuntimeRoot(manifest.fingerprint, cacheRoot);
  if (fs.existsSync(root)) {
    await validateRuntime(root, manifest);
    return root;
  }
  const archive = path.join(payloadDirectory, 'runtime.tar.gz');
  const digest = createHash('sha256').update(await fsp.readFile(archive)).digest('hex');
  if (digest !== manifest.sha256) throw new Error('Workspace runtime bundle SHA256 mismatch.');
  const parent = path.dirname(root);
  await fsp.mkdir(parent, { recursive: true });
  const staging = await fsp.mkdtemp(path.join(parent, '.install-'));
  try {
    await run('tar', ['-xzf', archive, '-C', staging], { windowsHide: true });
    await validateRuntime(staging, manifest);
    try {
      await fsp.rename(staging, root);
    } catch (error) {
      // Another process may have published this same immutable bundle.
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
      await validateRuntime(root, manifest);
    }
    return root;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

export async function installWorkspaceRuntime(payloadDirectory, cacheRoot) {
  const key = JSON.stringify([payloadDirectory, cacheRoot]);
  let installation = installations.get(key);
  if (!installation) {
    installation = installBundle(payloadDirectory, cacheRoot).catch(error => {
      installations.delete(key);
      throw error;
    });
    installations.set(key, installation);
  }
  return installation;
}
