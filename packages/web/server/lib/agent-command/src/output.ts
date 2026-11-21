// Adapted from OpenAI Codex, codex-rs/utils/string/src/truncate.rs.
// Apache-2.0; see ../vendor/codex-LICENSE.

const APPROX_BYTES_PER_TOKEN = 4;

export function truncateOutput(text: string, maxTokens: number) {
  const bytes = Buffer.from(text, "utf8");
  const maxBytes = maxTokens * APPROX_BYTES_PER_TOKEN;
  if (bytes.length <= maxBytes) return { output: text, truncated: false };

  const leftBudget = Math.floor(maxBytes / 2);
  const rightBudget = maxBytes - leftBudget;
  let prefixEnd = leftBudget;
  let suffixStart = bytes.length - rightBudget;
  while ((bytes.readUInt8(prefixEnd) & 0xc0) === 0x80) prefixEnd--;
  while (suffixStart < bytes.length && (bytes.readUInt8(suffixStart) & 0xc0) === 0x80)
    suffixStart++;
  const removedTokens = Math.ceil((bytes.length - maxBytes) / APPROX_BYTES_PER_TOKEN);
  const marker = `…${removedTokens} tokens truncated…`;
  return {
    output: bytes.subarray(0, prefixEnd).toString("utf8") + marker + bytes.subarray(suffixStart).toString("utf8"),
    truncated: true,
  };
}
