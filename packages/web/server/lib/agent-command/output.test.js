import { describe, expect, it } from 'vitest';
import { truncateOutput } from './src/output.ts';

describe('command output token budget', () => {
  it('retains complete output within the estimated token budget', () => {
    expect(truncateOutput('你好😀', 3)).toEqual({ output: '你好😀', truncated: false });
  });

  it('retains both ends and puts the omission marker outside the text budget', () => {
    expect(truncateOutput('abcdefghijklmnop', 2)).toEqual({ output: 'abcd…2 tokens truncated…mnop', truncated: true });
  });

  it('cuts on UTF-8 character boundaries', () => {
    expect(truncateOutput('你好😀世界', 2)).toEqual({ output: '你…2 tokens truncated…界', truncated: true });
  });

  it('supports a zero-token preview and empty output', () => {
    expect(truncateOutput('abcd', 0)).toEqual({ output: '…1 tokens truncated…', truncated: true });
    expect(truncateOutput('', 0)).toEqual({ output: '', truncated: false });
  });
});
