#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { resolveBunExecutable } from '../../../scripts/lib/bun-executable.mjs';
import { assignInjectedEnv, injectedEnvKeys, withoutInjectedEnv } from '../server/lib/injected-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const compilerPath = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');

export function createDevServerWatchCommand(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const bunExecutable = options.bunExecutable ?? resolveBunExecutable({ env, platform });
  const configuredPort = env.OPENCHAMBER_PORT?.trim();
  const port = configuredPort || '3001';
  const childEnv = withoutInjectedEnv(env);
  if (env.OPENCHAMBER_ELECTRON_DEV === '1' && env.OPENCHAMBER_ELECTRON_DEV_DATA_DIR && injectedEnvKeys(env).has('OPENCHAMBER_DATA_DIR')) {
    assignInjectedEnv(childEnv, { OPENCHAMBER_DATA_DIR: env.OPENCHAMBER_ELECTRON_DEV_DATA_DIR });
  }
  delete childEnv.OPENCHAMBER_ELECTRON_DEV_DATA_DIR;

  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error(`Invalid OPENCHAMBER_PORT: ${port}`);
  }

  return {
    command: bunExecutable,
    args: platform === 'win32'
      ? ['--watch', 'server/index.js', '--port', port]
      : [
          'x',
          'nodemon',
          '--watch',
          'server',
          '--ext',
          'js',
          '--exec',
          `bun server/index.js --port ${port}`,
        ],
    spawnOptions: {
      cwd: webRoot,
      stdio: 'inherit',
      // A shell an agent or the integrated terminal opens carries the app's
      // own server settings (its UI password, `OPENCHAMBER_RUNTIME=desktop`,
      // its web assets); the dev server would ask for that password and half
      // act as the desktop. The record holds names only, so an inline
      // override of a recorded name goes too; that fails closed (without
      // `OPENCHAMBER_HOST` it stays on loopback), and
      // `env -u OPENCHAMBER_INJECTED_ENV` keeps everything.
      env: {
        ...childEnv,
        OPENCHAMBER_RELAY_HOST: env.OPENCHAMBER_RELAY_HOST || 'off',
        // The dev UI runs on its own loopback port (Vite); see allowsLocalDevOrigins.
        OPENCHAMBER_ALLOW_DEV_ORIGINS: '1',
      },
      windowsHide: true,
    },
  };
}

export function runDevServerWatch(options = {}) {
  const runner = options.runner ?? spawn;
  const { command, args, spawnOptions } = createDevServerWatchCommand(options);
  const compiler = runner(process.execPath, [compilerPath, '--project', 'tsconfig.agent-command.build.json', '--watch', '--preserveWatchOutput'], spawnOptions);
  const searchCompiler = runner(command, ['build', './server/lib/agent-search/src/plugin.ts', '--outfile', './server/lib/agent-search/dist/plugin.js', '--target', 'node', '--format', 'esm', '--watch'], spawnOptions);
  const questionCompiler = runner(process.execPath, [compilerPath, '--project', 'tsconfig.agent-question.build.json', '--watch', '--preserveWatchOutput'], spawnOptions);
  const collaborationCompiler = runner(command, ['build', './server/lib/agent-collaboration/src/plugin.ts', './server/lib/agent-collaboration/src/runtime.ts', '--outdir', './server/lib/agent-collaboration/dist', '--target', 'node', '--format', 'esm', '--watch'], spawnOptions);
  const codeModeCompiler = runner(command, ['build', './server/lib/agent-code-mode/src/plugin.ts', '--outfile', './server/lib/agent-code-mode/dist/plugin.js', '--target', 'node', '--format', 'esm', '--watch'], spawnOptions);
  const workspaceCompiler = runner(command, ['build', './server/lib/workspace-dependencies/src/plugin.ts', '--outfile', './server/lib/workspace-dependencies/dist/plugin.js', '--target', 'node', '--format', 'esm', '--watch'], spawnOptions);
  const child = runner(command, args, spawnOptions);
  const watchers = [compiler, searchCompiler, questionCompiler, collaborationCompiler, codeModeCompiler, workspaceCompiler, child];
  let exitSignal = null;
  const stop = (signal) => {
    exitSignal = signal;
    for (const watcher of watchers) watcher.kill(signal);
  };
  const interrupt = () => stop('SIGINT');
  const terminate = () => stop('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  void Promise.all(watchers.map(watcher => new Promise(resolve => watcher.once('close', resolve))))
    .then(() => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
      if (exitSignal) process.kill(process.pid, exitSignal);
    });

  for (const builder of [compiler, searchCompiler, questionCompiler, collaborationCompiler, codeModeCompiler, workspaceCompiler]) {
    builder.on('error', (error) => {
      console.error('[dev:web:server] Failed to start tool compiler:', error);
      process.exitCode = 1;
      for (const watcher of watchers) if (watcher !== builder) watcher.kill();
    });
    builder.on('exit', (code) => {
      if (child.exitCode === null && child.signalCode === null) {
        process.exitCode = code || 1;
        for (const watcher of watchers) if (watcher !== builder) watcher.kill();
      }
    });
  }
  child.on('error', (error) => {
    compiler.kill();
    searchCompiler.kill();
    questionCompiler.kill();
    collaborationCompiler.kill();
    codeModeCompiler.kill();
    workspaceCompiler.kill();
    console.error('[dev:web:server] Failed to start server watcher:', error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    compiler.kill();
    searchCompiler.kill();
    questionCompiler.kill();
    collaborationCompiler.kill();
    codeModeCompiler.kill();
    workspaceCompiler.kill();
    if (signal) {
      exitSignal = signal;
      return;
    }
    process.exitCode = code ?? 1;
  });
  return child;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    runDevServerWatch();
  } catch (error) {
    console.error('[dev:web:server] Unable to configure server watcher:', error);
    process.exitCode = 1;
  }
}
