import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveAntigravityExecutable, installAntigravityExecutable } from './antigravity-executable.js';

test('explicit installation downloads a verified release for subsequent launches', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agy-install-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const env = { ...process.env, PATH: process.platform === 'win32' ? process.env.SystemRoot + '\\System32' : '/usr/bin:/bin' };
  const contents = '#!/bin/sh\nprintf agy-test';
  const executable = path.join(directory, 'antigravity');
  await fs.writeFile(executable, contents);
  const archive = path.join(directory, 'cli.tar.gz');
  if (process.platform !== 'win32') await promisify(execFile)('tar', ['-czf', archive, '-C', directory, 'antigravity']);
  const payload = process.platform === 'win32' ? Buffer.from(contents) : await fs.readFile(archive);
  const asset = 'https://storage.googleapis.com/antigravity-public/antigravity-cli/test/cli';
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    const url = String(input);
    requests.push(url);
    return url === asset ? new Response(payload) : Response.json({ url: asset, sha512: createHash('sha512').update(payload).digest('hex') });
  };
  assert.equal(resolveAntigravityExecutable(directory, 'agy', env), undefined);
  const binary = await installAntigravityExecutable(directory, env, fetchImpl);
  assert.equal(await fs.readFile(binary, 'utf8'), contents);
  assert.equal(resolveAntigravityExecutable(directory, 'agy', env), binary);
  assert.equal(await installAntigravityExecutable(directory, env, fetchImpl), binary);
  assert.equal(requests.length, 2);
});

test('PATH installations and explicit executable overrides are used without downloading', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agy-path-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, process.platform === 'win32' ? 'agy.exe' : 'agy');
  await fs.writeFile(executable, 'existing', { mode: 0o755 });
  const noDownload: typeof fetch = async () => { throw new Error('Existing executables must not download'); };
  assert.equal(resolveAntigravityExecutable(directory, 'agy', { PATH: directory }), executable);
  assert.equal(resolveAntigravityExecutable(directory, executable, {}), executable);
  assert.equal(await installAntigravityExecutable(directory, { PATH: directory }, noDownload), executable);
});
