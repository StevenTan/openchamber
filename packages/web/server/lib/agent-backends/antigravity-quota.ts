import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export async function readAntigravityQuota(profile: string, pid: number | undefined) {
  const directory = path.join(profile, 'antigravity-acp', 'log');
  const names = await fs.readdir(directory);
  const frontName = z.string().parse(names.find(item => item.endsWith(`-${pid}.log`)));
  const front = await fs.readFile(path.join(directory, frontName), 'utf8');
  const worker = z.string().parse([...front.matchAll(/front: started worker \d+ \(pid (\d+)\)/g)].at(-1)?.[1]);
  const name = z.string().parse((await fs.readdir(directory)).find(item => item.endsWith(`-${worker}.log`)));
  const log = await fs.readFile(path.join(directory, name), 'utf8');
  const port = z.string().parse([...log.matchAll(/Language server listening on random port at (\d+) for HTTP\b/g)].at(-1)?.[1]);
  const response = await fetch(`http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' },
    body: '{}', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Antigravity quota request failed (${response.status})`);
  return z.object({ response: z.json() }).parse(await response.json()).response;
}
