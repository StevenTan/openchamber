import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveTargetArchitecture } from './target-architecture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const architecture = resolveTargetArchitecture().node;
const runtime = fileURLToPath(new URL(`../.cache/workspace-runtime/${process.platform}-${architecture}`, import.meta.url));
const payload = fileURLToPath(new URL('../resources/workspace-runtime-bundle', import.meta.url));

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../../web/scripts/prepare-workspace-runtime.mjs', import.meta.url)),
  '--output', runtime,
  '--arch', architecture,
], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
fs.mkdirSync(payload, { recursive: true });
const archive = path.join(payload, 'runtime.tar.gz');
const packed = spawnSync('tar', ['-czf', archive, '-C', runtime, '.'], { stdio: 'inherit', windowsHide: true });
if (packed.error) throw packed.error;
if (packed.status !== 0) process.exit(packed.status ?? 1);
const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'runtime.json'), 'utf8'));
fs.writeFileSync(path.join(payload, 'bundle.json'), JSON.stringify({
  bundleFormatVersion: manifest.bundleFormatVersion,
  bundleVersion: manifest.bundleVersion,
  fingerprint: manifest.fingerprint,
  targetPlatform: manifest.targetPlatform,
  targetArch: manifest.targetArch,
  sha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
}, null, 2) + '\n');
