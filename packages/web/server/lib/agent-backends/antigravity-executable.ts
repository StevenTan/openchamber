import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { findExecutableOnPath } from '../tunnels/executable-search.js';

const manifestBase = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests';
const manifestSchema = z.object({
  url: z.string().url().startsWith('https://storage.googleapis.com/antigravity-public/antigravity-cli/'),
  sha512: z.string().regex(/^[a-fA-F0-9]{128}$/),
});

export class AntigravityNotInstalledError extends Error {
  constructor() { super('Antigravity is not installed. Install it in Settings > General > Conversation backend.'); }
}

export function resolveAntigravityExecutable(directory: string, binary: string, env: NodeJS.ProcessEnv): string | undefined {
  if (binary !== 'agy') return binary;
  const installed = findExecutableOnPath('agy', { env });
  if (installed) return installed;
  const managed = path.join(directory, 'bin', process.platform === 'win32' ? 'agy.exe' : 'agy');
  if (existsSync(managed)) return managed;
}

export async function installAntigravityExecutable(directory: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): Promise<string> {
  const installed = resolveAntigravityExecutable(directory, 'agy', env);
  if (installed) return installed;
  const windows = process.platform === 'win32';
  const managed = path.join(directory, 'bin', windows ? 'agy.exe' : 'agy');
  if (!['darwin', 'linux', 'win32'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch)) {
    throw new Error(`Antigravity installation is unavailable for ${process.platform}-${process.arch}.`);
  }
  const target = `${windows ? 'windows' : process.platform}_${process.arch === 'x64' ? 'amd64' : process.arch}`;
  const manifestResponse = await fetchImpl(`${manifestBase}/${target}.json`);
  if (!manifestResponse.ok) throw new Error(`Could not download the Antigravity release manifest: HTTP ${manifestResponse.status}.`);
  const manifest = manifestSchema.parse(await manifestResponse.json());
  const response = await fetchImpl(manifest.url);
  if (!response.ok) throw new Error(`Could not download Antigravity: HTTP ${response.status}.`);
  const payload = Buffer.from(await response.arrayBuffer());
  if (createHash('sha512').update(payload).digest('hex') !== manifest.sha512.toLowerCase()) {
    throw new Error('The Antigravity download failed its checksum check.');
  }
  await fs.mkdir(path.dirname(managed), { recursive: true });
  const staging = await fs.mkdtemp(path.join(directory, '.download-'));
  try {
    const executable = path.join(staging, windows ? 'agy.exe' : 'antigravity');
    if (windows) await fs.writeFile(executable, payload);
    else {
      const archive = path.join(staging, 'cli.tar.gz');
      await fs.writeFile(archive, payload);
      await promisify(execFile)('tar', ['-xzf', archive, '-C', staging, 'antigravity'], { env, windowsHide: true });
      await fs.chmod(executable, 0o755);
    }
    await fs.rename(executable, managed);
    return managed;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
