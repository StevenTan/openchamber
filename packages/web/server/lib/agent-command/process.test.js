import { describe, expect, it } from 'vitest';
import { buildCommandShellLaunch } from './src/process.ts';

describe('command shell launch', () => {
  it.each([
    ['/bin/sh', ['-c', 'printf ready']],
    ['/bin/dash', ['-c', 'printf ready']],
    ['/bin/bash', ['-l', '-c', 'printf ready']],
    ['powershell.exe', ['-Command', 'printf ready']],
  ])('launches %s with supported login arguments', (shell, args) => {
    expect(buildCommandShellLaunch(shell, 'printf ready', true)).toEqual({ executable: shell, args });
  });
});
