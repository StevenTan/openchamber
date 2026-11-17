export function commandWait(requested: number, platform = process.platform) {
  const minimum = platform === "win32" ? 10000 : 250;
  return Math.min(Math.max(requested, minimum), 30000);
}

export function continuationWait(chars: string, requested?: number, closeStdin = false) {
  const waiting = chars === "" && !closeStdin;
  const minimum = waiting ? 5000 : 250;
  const maximum = waiting ? 300000 : 30000;
  return Math.min(Math.max(requested ?? 250, minimum), maximum);
}
