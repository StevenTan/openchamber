import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverSkills, type ParsedSkillFiles } from '../opencode/skills.js';
import { readConfig } from '../opencode/config-files.js';
import { normalizePermissionRules, readGlobalPermissionRules } from '../opencode/config-v2.js';
import { isRecord } from '../shared/guards.js';
import { Wildcard } from '../agent-code-mode/src/vendor/wildcard.js';
import type { ConversationSkills } from '@openchamber/sdk/conversations/http';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { z } from 'zod';
import type { Application, ExpressFactory, Request, NextFunction, Response } from '../shared/http-contracts.js';

export async function listConversationSkills(directory: string, additionalDirectories: readonly string[] = []) {
  const parsedFiles: ParsedSkillFiles = new Map();
  const skills = await discoverSkills(directory, { parsedFiles, additionalDirectories });
  const config = readConfig(directory);
  const rules = [...readGlobalPermissionRules(config),
    ...normalizePermissionRules(isRecord(config.experimental) ? config.experimental.policies : undefined),
    ...normalizePermissionRules(config.policies)];
  return skills.map(skill => {
    const frontmatter = parsedFiles.get(skill.path)?.frontmatter;
    const enabled = rules.findLast(rule => rule.action === 'integration.use'
      ? Wildcard.match(`skill:${skill.name}`, rule.resource)
      : Wildcard.match('skill', rule.action.replace(/\.use$/, '')) && Wildcard.match(skill.name, rule.resource))?.effect !== 'deny';
    return { ...skill, id: skill.name, enabled, autoinvoke: !(isRecord(frontmatter) && frontmatter['disable-model-invocation'] === true) };
  });
}

export function conversationSkillGuidance(skills: Awaited<ReturnType<typeof listConversationSkills>>) {
  return [
    'Skills provide specialized instructions and workflows. When a task matches a skill description, read its SKILL.md with a shell command and follow its instructions. Resolve supporting files relative to that skill directory. When the user names a skill, use that skill.',
    'Available skills (name, description, absolute SKILL.md path):',
    JSON.stringify(skills.filter(skill => skill.enabled && skill.autoinvoke).map(({ name, description, path }) => ({ name, description, path }))),
  ].join('\n');
}

export function resolveConversationSkills(skills: Awaited<ReturnType<typeof listConversationSkills>>, names: readonly string[]): ConversationSkills {
  const attached = [...new Set(names)].flatMap(name => {
    const skill = skills.find(skill => skill.name === name);
    return skill ? [{ id: skill.id, name }] : [];
  });
  return { attached, unresolved: names.filter(name => !attached.some(skill => skill.name === name)) };
}

export async function readConversationSkills(skills: Awaited<ReturnType<typeof listConversationSkills>>, selected: readonly { id: string }[]) {
  return Promise.all(selected.map(async ({ id }) => {
    const skill = skills.find(skill => skill.id === id);
    if (!skill) throw new OpenChamberControlError(`Skill not found: ${id}`, 400);
    return { text: `Skill: ${skill.name}\nSkill directory: ${path.dirname(skill.path)}\nSKILL.md: ${skill.path}\n\n${await fs.readFile(skill.path, 'utf8')}` };
  }));
}

export function registerSkillCatalogRoute(app: Application, express: Pick<ExpressFactory, 'json'>, options: {
  authorize(request: Pick<Request, 'socket' | 'headers'>): boolean;
  directories(): readonly string[];
}) {
  const input = z.object({ directory: z.string(), rules: z.array(z.object({ action: z.string(), resource: z.string(), effect: z.enum(['allow', 'deny', 'ask']) })) });
  app.post('/api/openchamber/skills', express.json({ limit: '1mb' }), async (req: Request, res: Response, next: NextFunction) => {
    if (!options.authorize(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { directory, rules } = input.parse(req.body);
      const skills = await listConversationSkills(directory, options.directories());
      const permitted = skills.filter(skill => rules.findLast(rule => Wildcard.match('skill', rule.action) && Wildcard.match(skill.id, rule.resource))?.effect !== 'deny');
      res.json({ text: conversationSkillGuidance(permitted) });
    } catch (error) { next(error); }
  });
}
