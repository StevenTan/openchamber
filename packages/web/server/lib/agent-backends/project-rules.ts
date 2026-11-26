import fs from 'node:fs/promises';
import path from 'node:path';
import { findWorktreeRoot, getAncestors } from '../opencode/config-files.js';

export async function readProjectRules(directory: string): Promise<Array<{ text: string }>> {
  const rules: Array<{ text: string }> = [];
  const folders = getAncestors(directory, findWorktreeRoot(directory) ?? directory).reverse();
  for (const folder of folders) {
    for (const name of ['AGENTS.md', 'GEMINI.md']) {
      const file = path.join(folder, name);
      let content: string;
      try { content = await fs.readFile(file, 'utf8'); }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
        throw error;
      }
      rules.push({ text: `Project instructions: ${file}\nApplies to: ${folder} and its descendants. More specific directory instructions take precedence. Read additional AGENTS.md and GEMINI.md files before working in descendant directories.\n\n${content}` });
    }
  }
  return rules;
}
