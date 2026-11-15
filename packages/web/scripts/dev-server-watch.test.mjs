import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import { createDevServerWatchCommand, runDevServerWatch } from './dev-server-watch.mjs';

describe('createDevServerWatchCommand', () => {
  it('uses the package default port and disables relay hosting by default', () => {
    const command = createDevServerWatchCommand({
      platform: 'win32',
      env: {},
      bunExecutable: '/opt/bun/bin/bun',
    });

    expect(command.command).toBe('/opt/bun/bin/bun');
    expect(command.args).toEqual(['--watch', 'server/index.js', '--port', '3001']);
    expect(command.spawnOptions.env.OPENCHAMBER_RELAY_HOST).toBe('off');
    expect(command.spawnOptions.windowsHide).toBe(true);
  });

  it('passes the configured port and relay host to the Bun watcher', () => {
    const command = createDevServerWatchCommand({
      platform: 'win32',
      env: {
        OPENCHAMBER_PORT: '58992',
        OPENCHAMBER_RELAY_HOST: 'relay.example.test',
      },
      bunExecutable: 'C:\\Tools\\Bun\\bun.exe',
    });

    expect(command.args).toEqual(['--watch', 'server/index.js', '--port', '58992']);
    expect(command.spawnOptions.env.OPENCHAMBER_RELAY_HOST).toBe('relay.example.test');
  });

  it('rejects an invalid configured port before spawning', () => {
    expect(() => createDevServerWatchCommand({
      platform: 'win32',
      env: { OPENCHAMBER_PORT: 'not-a-port' },
      bunExecutable: 'bun',
    })).toThrow(/Invalid OPENCHAMBER_PORT/);
  });

  it('preserves the nodemon watcher command outside Windows', () => {
    const command = createDevServerWatchCommand({
      platform: 'linux',
      env: { OPENCHAMBER_PORT: '4200' },
      bunExecutable: '/opt/bun/bin/bun',
    });

    expect(command.command).toBe('/opt/bun/bin/bun');
    expect(command.args).toEqual([
      'x',
      'nodemon',
      '--watch',
      'server',
      '--ext',
      'js',
      '--exec',
      'bun server/index.js --port 4200',
    ]);
  });

  it('drops what an OpenChamber app put into the shell and keeps the user\'s own exports', () => {
    const command = createDevServerWatchCommand({
      platform: 'linux',
      env: {
        PATH: '/usr/bin',
        OPENCHAMBER_PORT: '4200',
        OPENCHAMBER_UI_PASSWORD: 'desktop-secret',
        OPENCHAMBER_RUNTIME: 'desktop',
        OPENCODE_PASSWORD: 'theirs',
        OPENCHAMBER_INJECTED_ENV: 'OPENCHAMBER_UI_PASSWORD,OPENCHAMBER_RUNTIME',
      },
      bunExecutable: 'bun',
    });

    const { env } = command.spawnOptions;
    expect(env).not.toHaveProperty('OPENCHAMBER_UI_PASSWORD');
    expect(env).not.toHaveProperty('OPENCHAMBER_RUNTIME');
    expect(env).not.toHaveProperty('OPENCHAMBER_INJECTED_ENV');
    expect(env).toMatchObject({ PATH: '/usr/bin', OPENCHAMBER_PORT: '4200', OPENCODE_PASSWORD: 'theirs' });
  });

  it('waits for all watchers to close when the parent receives a termination signal', async () => {
    const children = Array.from({ length: 3 }, () => Object.assign(new EventEmitter(), {
      kill: vi.fn(), exitCode: null, signalCode: null,
    }));
    const signals = new Map();
    const once = process.once;
    vi.spyOn(process, 'once').mockImplementation(function (event, listener) {
      if (event === 'SIGINT' || event === 'SIGTERM') {
        signals.set(event, listener);
        return this;
      }
      return once.call(this, event, listener);
    });
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    try {
      runDevServerWatch({ runner: vi.fn().mockReturnValueOnce(children[0]).mockReturnValueOnce(children[1]).mockReturnValueOnce(children[2]), env: {}, bunExecutable: 'bun' });
      signals.get('SIGTERM')();
      for (const child of children) expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      children[0].emit('close');
      await Promise.resolve();
      expect(kill).not.toHaveBeenCalled();
      children[1].emit('close');
      await Promise.resolve();
      expect(kill).not.toHaveBeenCalled();
      children[2].emit('close');
      await Promise.resolve();
      await Promise.resolve();
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      for (const child of children) child.emit('close');
      await Promise.resolve();
      await Promise.resolve();
      vi.restoreAllMocks();
    }
  });
});
