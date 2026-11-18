import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadDependencies } from './src/plugin.ts';

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

async function fixture(overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace PDF 环境 '));
  directories.push(root);
  const info = { bundleFormatVersion: 1, bundleVersion: 'fixture', targetPlatform: process.platform, targetArch: process.arch, pythonVersion: '3.12.16', packages: { pypdf: '6.21.4' }, popplerVersion: '26.06.0', ...overrides };
  await fs.writeFile(path.join(root, 'runtime.json'), JSON.stringify(info));
  const executable = path.join(root, 'dependencies/python', ...(process.platform === 'win32' ? ['python.exe'] : ['bin/python3']));
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.writeFile(executable, '', { mode: 0o755 });
  const bin = path.join(root, 'dependencies/bin/override');
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const pdftoppm = path.join(bin, 'pdftoppm' + suffix);
  const pdfinfo = path.join(bin, 'pdfinfo' + suffix);
  const native = path.join(root, 'dependencies/native/poppler');
  await fs.mkdir(bin, { recursive: true });
  await fs.mkdir(native, { recursive: true });
  for (const file of [pdftoppm, pdfinfo, path.join(native, process.platform === 'win32' ? 'poppler-utils.exe' : 'poppler-utils')]) {
    await fs.writeFile(file, '', { mode: 0o755 });
  }
  await fs.writeFile(path.join(native, 'fonts.conf'), '<fontconfig/>');
  return { root, executable, pdftoppm, pdfinfo };
}

it('locates the configured environment independently of project paths', async () => {
  const { root, executable, pdftoppm, pdfinfo } = await fixture();
  const result = await loadDependencies(root);
  expect(result).toEqual({ bundleVersion: 'fixture', python: { executable, packages: path.join(root, 'dependencies/python'), version: '3.12.16' }, pdf: { packages: { pypdf: '6.21.4' }, popplerVersion: '26.06.0', pdftoppm, pdfinfo } });
});

it('rejects another host architecture', async () => {
  const { root } = await fixture({ targetArch: process.arch === 'arm64' ? 'x64' : 'arm64' });
  await expect(loadDependencies(root)).rejects.toThrow('this host is');
});

it('reports an incomplete environment instead of selecting system Python', async () => {
  const { root, executable } = await fixture();
  await fs.rm(executable);
  await expect(loadDependencies(root)).rejects.toThrow('ENOENT');
});

it('reports a missing Poppler command', async () => {
  const { root, pdftoppm } = await fixture();
  await fs.rm(pdftoppm);
  await expect(loadDependencies(root)).rejects.toThrow('ENOENT');
});
