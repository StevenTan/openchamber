// Adapted from OpenCode v2.3.2, https://github.com/anomalyco/opencode. MIT; see LICENSE.txt.
export * as Bom from "./bom.js"

const code = 0xfeff
const value = String.fromCharCode(code)

export function split(text: string) {
  const stripped = text.replace(/^\uFEFF+/, "")
  return { bom: stripped.length !== text.length, text: stripped }
}

export function join(text: string, bom: boolean) {
  const stripped = split(text).text
  return bom ? value + stripped : stripped
}

