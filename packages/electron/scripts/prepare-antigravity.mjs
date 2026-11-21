import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveTargetArchitecture } from './target-architecture.mjs';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(fs.readFileSync(path.join(electronRoot, 'antigravity', 'release.json'), 'utf8'));
const { node: arch } = resolveTargetArchitecture();
const target = `${process.platform}-${arch}`;
const { url, sha512 } = release.targets[target];
const cacheDir = path.join(electronRoot, '.cache', 'antigravity', release.version, target);
const archive = path.join(cacheDir, path.basename(url));
const outputDir = path.join(electronRoot, 'resources', 'antigravity');

fs.mkdirSync(cacheDir, { recursive: true });
if (!fs.existsSync(archive)) {
  console.log(`[electron] downloading Antigravity ${release.version} for ${target}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
}
const digest = createHash('sha512').update(fs.readFileSync(archive)).digest('hex');
if (digest !== sha512) throw new Error(`Antigravity archive checksum does not match: ${archive}`);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
if (process.platform === 'win32') {
  fs.copyFileSync(archive, path.join(outputDir, 'agy.exe'));
} else {
  const result = spawnSync('tar', ['-xzf', archive, '-C', outputDir, 'antigravity'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Failed to extract ${archive}: ${result.stderr || result.error?.message}`);
  const executable = path.join(outputDir, 'agy');
  fs.renameSync(path.join(outputDir, 'antigravity'), executable);
  fs.chmodSync(executable, 0o755);
}
console.log(`[electron] prepared Antigravity ${release.version} for ${target}: resources/antigravity`);
