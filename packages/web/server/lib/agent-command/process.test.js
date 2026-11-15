import { describe, expect, it } from 'vitest';
import { buildCommandShellLaunch, prepareCommandSpawn } from './src/process.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

describe('command shell launch', () => {
  it.each([
    ['/bin/sh', ['-c', 'printf ready']],
    ['/bin/dash', ['-c', 'printf ready']],
    ['/bin/bash', ['-l', '-c', 'printf ready']],
    ['powershell.exe', ['-Command', 'printf ready']],
  ])('launches %s with supported login arguments', (shell, args) => {
    expect(buildCommandShellLaunch(shell, 'printf ready', true)).toEqual({ executable: shell, args });
  });

  it('rejects pipe startup failures without a process handle', async () => {
    const spawn = await prepareCommandSpawn(false);
    await expect(spawn({ command: 'printf ready', workdir: '/openchamber-missing-command-directory', login: false, env: process.env })).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.skipIf(process.platform === 'win32')('finishes pending launch cleanup before the owner exits', async () => {
    const source = `
      import { createRequire, syncBuiltinESMExports } from 'node:module';
      const cp = createRequire(import.meta.url)('node:child_process');
      const spawn = cp.spawn;
      let launched;
      cp.spawn = (...args) => { launched = spawn(...args); return launched; };
      syncBuiltinESMExports();
      const { TerminalManager } = await import(${JSON.stringify(new URL('./dist/terminal-manager.js', import.meta.url).href)});
      const manager = new TerminalManager();
      void manager.executeCommand('sleep 30', 1000, { workdir: process.cwd(), login: false }).catch(() => undefined);
      await Promise.resolve();
      await manager.close();
      console.log(launched.pid);
      process.exit(0);
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source]);
    const pid = Number(stdout.trim());
    expect(pid).toBeGreaterThan(0);
    try {
      expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    } finally {
      try { process.kill(-pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  });
});
