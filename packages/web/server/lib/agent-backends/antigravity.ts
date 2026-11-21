import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const desktopProcess: NodeJS.Process & { resourcesPath?: string } = process;
const webRoot = path.dirname(createRequire(import.meta.url).resolve('@openchamber/web/package.json'));
const directory = () => process.env.OPENCHAMBER_BUNDLED_ANTIGRAVITY_DIR
  ?? (desktopProcess.resourcesPath ? path.join(desktopProcess.resourcesPath, 'antigravity') : path.resolve(webRoot, '../electron/resources/antigravity'));
const executable = () => path.join(directory(), process.platform === 'win32' ? 'agy.exe' : 'agy');

export const antigravityAvailable = () => fs.existsSync(executable());
export const antigravityLaunch = () => ({
  command: executable(),
  args: ['acp', '--disable-telemetry'],
});

export function antigravityAuthMethod(env: NodeJS.ProcessEnv) {
  if (env.GEMINI_API_KEY) return 'gemini-api-key';
  return undefined;
}
