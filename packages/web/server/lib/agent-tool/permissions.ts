import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { JsonObject } from '../shared/json-values.js';

const rule = z.object({ action: z.string(), resource: z.string(), effect: z.enum(['allow', 'deny', 'ask']) });
export type ToolPermissionRule = z.infer<typeof rule>;
export interface ToolPermissionInput {
  action: string;
  resources: string[];
  save: string[];
  metadata?: JsonObject;
}
export interface ToolPermissionPolicy {
  directory: string;
  projectDirectory: string;
  rules: readonly ToolPermissionRule[];
  savedRules?: readonly ToolPermissionRule[];
}
export interface ToolPermissionSession extends Pick<ToolPermissionPolicy, 'directory' | 'projectDirectory'> {
  assert(input: ToolPermissionInput, signal: AbortSignal): Promise<void>;
}
export interface ToolPermissions {
  session(sessionID: string): Promise<ToolPermissionSession>;
}
export interface PermissionRequest extends ToolPermissionInput {
  id: string;
  sessionID: string;
}
interface Pending {
  request: PermissionRequest;
  policy: ToolPermissionPolicy;
  settle(error?: Error): void;
}
interface Options {
  file: string;
  readPolicy(sessionID: string): Promise<ToolPermissionPolicy>;
  publish(type: 'permission.asked' | 'permission.replied', data: JsonObject, directory: string): void;
}

const match = (value: string, pattern: string) => {
  let expression = pattern.replaceAll('\\', '/').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  if (expression.endsWith(' .*')) expression = expression.slice(0, -3) + '( .*)?';
  return new RegExp(`^${expression}$`, process.platform === 'win32' ? 'si' : 's').test(value.replaceAll('\\', '/'));
};
const evaluate = (action: string, resource: string, rules: readonly ToolPermissionRule[]) =>
  rules.findLast(rule => match(action, rule.action) && match(resource, rule.resource))?.effect ?? 'ask';

export function createToolPermissions({ file, readPolicy, publish }: Options) {
  const grants = fs.existsSync(file) ? z.record(z.string(), z.array(rule)).parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : {};
  const pending = new Map<string, Pending>();
  const effect = (input: ToolPermissionInput, policy: ToolPermissionPolicy) => {
    if (input.resources.some(resource => evaluate(input.action, resource, policy.rules) === 'deny')) return 'deny';
    const rules = [...policy.rules, ...policy.savedRules ?? [], ...grants[policy.projectDirectory] ?? []];
    return input.resources.every(resource => evaluate(input.action, resource, rules) === 'allow') ? 'allow' : 'ask';
  };
  const session = async (sessionID: string): Promise<ToolPermissionSession> => {
    const policy = await readPolicy(sessionID);
    return { directory: policy.directory, projectDirectory: policy.projectDirectory, assert: async (input, signal) => {
      signal.throwIfAborted();
      const decision = effect(input, policy);
      if (decision === 'deny') throw new Error(`Permission denied: ${input.action}`);
      if (decision === 'allow') return;
      const request = { ...input, id: `per_oc_${randomUUID()}`, sessionID };
      await new Promise<void>((resolve, reject) => {
        const settle = (error?: Error) => {
          pending.delete(request.id);
          signal.removeEventListener('abort', abort);
          publish('permission.replied', { sessionID, requestID: request.id }, policy.directory);
          if (error) reject(error);
          else resolve();
        };
        const abort = () => settle(new Error('Permission request cancelled'));
        pending.set(request.id, { request, policy, settle });
        signal.addEventListener('abort', abort, { once: true });
        publish('permission.asked', { ...request }, policy.directory);
      });
    } };
  };
  const get = (sessionID: string, requestID: string) => {
    const entry = pending.get(requestID);
    return entry?.request.sessionID === sessionID ? entry.request : undefined;
  };
  const list = (directory?: string) => [...pending.values()]
    .filter(entry => directory === undefined || entry.policy.directory === directory)
    .map(entry => ({ request: entry.request, directory: entry.policy.directory }));
  const reply = async (sessionID: string, requestID: string, decision: 'once' | 'always' | 'reject', message?: string) => {
    const entry = pending.get(requestID);
    if (!entry || entry.request.sessionID !== sessionID) return false;
    if (decision === 'reject') {
      for (const item of pending.values()) {
        if (item.request.sessionID === sessionID) item.settle(new Error(message ?? 'The user rejected permission'));
      }
      return true;
    }
    if (decision === 'always') {
      const saved = entry.request.save.map(resource => ({ action: entry.request.action, resource, effect: 'allow' as const }));
      const rules = [...grants[entry.policy.projectDirectory] ?? [], ...saved];
      fs.writeFileSync(file, JSON.stringify({ ...grants, [entry.policy.projectDirectory]: rules }));
      grants[entry.policy.projectDirectory] = rules;
    }
    entry.settle();
    if (decision === 'always') {
      for (const item of pending.values()) {
        const policy = await readPolicy(item.request.sessionID);
        if (effect(item.request, policy) === 'allow') item.settle();
      }
    }
    return true;
  };
  return { session, get, list, reply };
}
