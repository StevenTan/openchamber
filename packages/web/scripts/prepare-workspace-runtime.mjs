import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { zstdDecompressSync } from 'node:zlib';
import { runtimeFingerprint, workspaceRuntimeRoot } from '../server/lib/workspace-dependencies/cache.js';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(webRoot, 'server/lib/workspace-dependencies');
const specText = fs.readFileSync(path.join(source, 'runtime-spec.json'), 'utf8');
const spec = JSON.parse(specText);
const requirements = path.join(source, 'requirements.txt');
const lockText = fs.readFileSync(requirements, 'utf8');
const fingerprint = runtimeFingerprint();
const { values } = parseArgs({ options: { output: { type: 'string' }, arch: { type: 'string', default: process.arch } } });
const output = path.resolve(values.output || workspaceRuntimeRoot(fingerprint, undefined, process.platform, values.arch));
const target = `${process.platform}-${values.arch}`;
const artifact = spec.targets[target];
if (!artifact) throw new Error(`No workspace runtime for ${target}.`);
const cache = path.join(webRoot, '.cache/workspace-runtime');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}.`);
}

function executable(root, platform = process.platform) {
  return path.join(root, 'dependencies/python', ...(platform === 'win32' ? ['python.exe'] : ['bin/python3']));
}

function archiveFor(artifact, extension = 'tar.gz') {
  const archive = path.join(cache, `${artifact.sha256}.${extension}`);
  fs.mkdirSync(cache, { recursive: true });
  if (!fs.existsSync(archive)) {
    const temporary = `${archive}.download-${process.pid}`;
    try {
      run('curl', ['--fail', '--location', '--connect-timeout', '30', '--max-time', '300', '--output', temporary, artifact.url]);
      fs.renameSync(temporary, archive);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  if (digest !== artifact.sha256) {
    fs.rmSync(archive);
    throw new Error(`Workspace runtime artifact SHA256 mismatch for ${artifact.url}.`);
  }
  return archive;
}

function extract(artifact, root) {
  const dependencies = path.join(root, 'dependencies');
  fs.mkdirSync(dependencies, { recursive: true });
  const archive = archiveFor(artifact);
  run('tar', ['-xzf', path.relative(dependencies, archive)], dependencies);
}

function probe(root) {
  run(executable(root), ['-I', '-c', 'import sys,pypdf,pdfplumber,reportlab,pypdfium2; assert sys.version.split()[0] == ' + JSON.stringify(spec.pythonVersion)]);
  const poppler = path.join(root, 'dependencies/native/poppler', process.platform === 'win32' ? 'poppler-utils.exe' : 'poppler-utils');
  run(poppler, ['--unpin-program=pdftoppm', '-v']);
  run(poppler, ['--unpin-program=pdfinfo', '-v']);
}

function preparePoppler(root) {
  const archive = archiveFor(spec.poppler.targets[target], 'zst');
  const directory = path.join(root, 'dependencies/native/poppler');
  const bin = path.join(root, 'dependencies/bin/override');
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  const distribution = zstdDecompressSync(fs.readFileSync(archive));
  fs.writeFileSync(path.join(directory, process.platform === 'win32' ? 'poppler-utils.exe' : 'poppler-utils'), distribution, { mode: 0o755 });
  fs.copyFileSync(path.join(source, 'poppler-notices.txt'), path.join(directory, 'NOTICES.txt'));
  const packagePath = process.platform === 'win32' ? 'Lib/site-packages' : 'lib/python3.12/site-packages';
  const systemFonts = {
    darwin: ['/System/Library/Fonts', '/Library/Fonts', '~/Library/Fonts'],
    linux: ['/usr/share/fonts', '/usr/local/share/fonts', '~/.fonts'],
    win32: ['WINDOWSFONTDIR'],
  }[process.platform];
  const fonts = ['<?xml version="1.0"?>', '<fontconfig>',
    `<dir prefix="relative">../../python/${packagePath}/reportlab/fonts</dir>`,
    ...systemFonts.map(directory => `<dir>${directory}</dir>`),
    '<dir prefix="xdg">fonts</dir>', '<cachedir prefix="xdg">fontconfig</cachedir>', '</fontconfig>'];
  fs.writeFileSync(path.join(directory, 'fonts.conf'), fonts.join('\n') + '\n');
  for (const name of ['pdftoppm', 'pdfinfo']) {
    const windows = process.platform === 'win32';
    const launcher = windows
      ? `@echo off\r\nsetlocal\r\nset "FONTCONFIG_FILE=%~dp0..\\..\\native\\poppler\\fonts.conf"\r\n"%~dp0..\\..\\native\\poppler\\poppler-utils.exe" --unpin-program=${name} %*\r\nexit /b %errorlevel%\r\n`
      : `#!/usr/bin/env bash\nset -euo pipefail\nSCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"\nPOPPLER_ROOT="$(cd "\${SCRIPT_DIR}/../../native/poppler" && pwd)"\nexport FONTCONFIG_FILE="\${POPPLER_ROOT}/fonts.conf"\nexec "\${POPPLER_ROOT}/poppler-utils" --unpin-program=${name} "$@"\n`;
    fs.writeFileSync(path.join(bin, name + (windows ? '.cmd' : '')), launcher, { mode: 0o755 });
  }
}

const manifest = path.join(output, 'runtime.json');
if (fs.existsSync(manifest)) {
  const current = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (current.fingerprint === fingerprint && current.targetPlatform === process.platform && current.targetArch === values.arch) {
    if (values.arch === process.arch) probe(output);
    console.log(`[workspace] runtime ${spec.bundleVersion} ready: ${output}`);
    process.exit(0);
  }
}

fs.mkdirSync(path.dirname(output), { recursive: true });
const staging = fs.mkdtempSync(path.join(path.dirname(output), '.workspace-runtime-'));
try {
  extract(artifact, staging);
  let installer = executable(staging);
  if (values.arch !== process.arch) {
    const host = path.join(cache, `host-${process.platform}-${process.arch}-${spec.pythonVersion}`);
    if (!fs.existsSync(executable(host))) extract(spec.targets[`${process.platform}-${process.arch}`], host);
    installer = executable(host);
  }
  const packages = path.join(staging, 'dependencies/python', ...(process.platform === 'win32' ? ['Lib', 'site-packages'] : ['lib', 'python3.12', 'site-packages']));
  run(installer, ['-I', '-m', 'pip', '--isolated', 'install', '--disable-pip-version-check', '--no-compile', '--only-binary=:all:', '--require-hashes', '--ignore-installed', '--python-version', '3.12', '--implementation', 'cp', '--abi', 'cp312',
    ...artifact.wheelPlatforms.flatMap(platform => ['--platform', platform]), '--target', packages, '-r', requirements]);
  preparePoppler(staging);
  if (values.arch === process.arch) probe(staging);
  const versions = Object.fromEntries([...lockText.matchAll(/^([\w.-]+)==([^\s\\]+)/gm)].map(match => [match[1], match[2]]));
  fs.writeFileSync(path.join(staging, 'runtime.json'), JSON.stringify({
    bundleFormatVersion: 1, bundleVersion: spec.bundleVersion, targetPlatform: process.platform,
    targetArch: values.arch, pythonVersion: spec.pythonVersion, packages: versions, fingerprint,
    popplerVersion: spec.poppler.version,
  }, null, 2) + '\n');
  const backup = `${staging}.previous`;
  const replacing = fs.existsSync(output);
  if (replacing) fs.renameSync(output, backup);
  try {
    fs.renameSync(staging, output);
  } catch (error) {
    if (replacing) fs.renameSync(backup, output);
    throw error;
  }
  if (replacing) fs.rmSync(backup, { recursive: true });
  console.log(`[workspace] prepared runtime ${spec.bundleVersion}: ${output}`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
