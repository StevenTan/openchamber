import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Result } from 'effect';
import type { FileCall } from './contracts.js';
import { Bom } from './vendor/bom.js';
import { Patch } from './vendor/patch.js';
import { findOccurrences, matchView } from './vendor/edit.js';
import { isMissingFileError } from '../share-pages/file-errors.js';

export interface FileChange {
  absolute: string;
  destination?: string;
  file: string;
  before: string;
  after: string;
  content: string;
  status: 'added' | 'modified' | 'deleted';
}
type Mutation = Exclude<FileCall, { name: 'view_image' }>;

export const resolveFile = (directory: string, file: string) => path.resolve(directory,
  file === '~' ? os.homedir() : file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file);
const resource = (directory: string, file: string) => {
  const relative = path.relative(directory, file);
  return (relative === '..' || relative.startsWith(`..${path.sep}`) ? file : relative).replaceAll(path.sep, '/');
};

export function parsePatch(text: string) {
  const body = text.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '');
  const parsed = Patch.parse(body.trimStart().startsWith('*** Begin Patch') ? body : `*** Begin Patch\n${body}\n*** End Patch`);
  if (Result.isFailure(parsed)) throw new Error(`patch verification failed: ${parsed.failure.message}`);
  if (parsed.success.length === 0) throw new Error('patch rejected: empty patch');
  return parsed.success;
}

export function fileCallPaths(call: FileCall, directory: string) {
  const files = call.name === 'patch'
    ? parsePatch(call.input.patchText).flatMap(hunk => [hunk.path, ...(hunk.type === 'update' && hunk.movePath ? [hunk.movePath] : [])])
    : [call.input.path];
  return [...new Set(files.map(file => resolveFile(directory, file)))];
}

async function readOptional(file: string) {
  try { return await fs.readFile(file, 'utf8'); }
  catch (error) { if (isMissingFileError(error)) return undefined; throw error; }
}

export async function prepareFileMutation(call: Mutation, directory: string): Promise<FileChange[]> {
  if (call.name === 'patch') {
    const changes: FileChange[] = [];
    const updates = new Map<string, string | null>();
    for (const hunk of parsePatch(call.input.patchText)) {
      const absolute = resolveFile(directory, hunk.path);
      if (hunk.type === 'add') {
        const content = hunk.contents.endsWith('\n') || hunk.contents === '' ? hunk.contents : `${hunk.contents}\n`;
        changes.push({ absolute, file: resource(directory, absolute), content, before: '', after: Bom.split(content).text, status: 'added' });
        updates.set(absolute, content);
        continue;
      }
      const previous = updates.get(absolute);
      if (previous === null) throw new Error(`patch verification failed: File does not exist: ${hunk.path}`);
      const original = previous ?? await fs.readFile(absolute, 'utf8');
      const before = Bom.split(original).text;
      if (hunk.type === 'delete') {
        changes.push({ absolute, file: resource(directory, absolute), content: '', before, after: '', status: 'deleted' });
        updates.set(absolute, null);
        continue;
      }
      const update = Patch.derive(hunk.path, hunk.chunks, original);
      const move = hunk.movePath ? resolveFile(directory, hunk.movePath) : absolute;
      const content = Patch.joinBom(update.content, update.bom);
      const change: FileChange = { absolute, file: resource(directory, move), before, after: update.content, content, status: 'modified' };
      if (move !== absolute) {
        change.destination = move;
        updates.set(absolute, null);
      }
      changes.push(change);
      updates.set(move, content);
    }
    return changes;
  }
  const absolute = resolveFile(directory, call.input.path);
  const original = await readOptional(absolute);
  const current = Bom.split(original ?? '');
  if (call.name === 'write') {
    const next = Bom.split(call.input.content);
    return [{ absolute, file: resource(directory, absolute), before: current.text, after: next.text,
      content: Bom.join(next.text, current.bom || next.bom), status: original === undefined ? 'added' : 'modified' }];
  }
  const { oldString, newString, replaceAll } = call.input;
  if (oldString === newString) throw new Error('No changes to apply: oldString and newString are identical.');
  if (oldString === '') throw new Error('oldString must not be empty. Use write to create or overwrite a file.');
  if (original === undefined) throw new Error(`File not found: ${call.input.path}`);
  const endingsOnly = oldString.replaceAll('\r', '') === newString.replaceAll('\r', '');
  const { matches, replace } = endingsOnly
    ? { matches: findOccurrences(current.text, oldString), replace: () => newString }
    : matchView(current.text, oldString, newString);
  if (matches.length === 0) throw new Error(`Could not find oldString in ${call.input.path}. It must match exactly, including whitespace and indentation.`);
  if (matches.length > 1 && replaceAll !== true) throw new Error(`Found ${matches.length} matches for oldString, but expected exactly one. Add more surrounding context to make oldString unique, or set replaceAll to true to replace every occurrence.`);
  const after = (replaceAll === true ? matches : matches.slice(0, 1)).toReversed().reduce(
    (content, match) => `${content.slice(0, match.start)}${replace(match)}${content.slice(match.end)}`, current.text);
  if (after === current.text) throw new Error(`No changes to apply: the edit leaves ${call.input.path} unchanged.`);
  return [{ absolute, file: resource(directory, absolute), before: current.text, after, content: Bom.join(after, current.bom), status: 'modified' }];
}

export async function applyFileChanges(changes: FileChange[], signal: AbortSignal) {
  const completed: string[] = [];
  for (const change of changes) {
    signal.throwIfAborted();
    try {
      if (change.status === 'deleted') await fs.unlink(change.absolute);
      else {
        const target = change.destination ?? change.absolute;
        const recased = change.destination !== undefined && target.toLowerCase() === change.absolute.toLowerCase()
          && await fs.stat(change.absolute).then(info => info.isFile(), () => false)
          && await fs.stat(target).then(() => true, () => false);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(recased ? change.absolute : target, change.content);
        if (change.destination) {
          if (recased) await fs.rename(change.absolute, target);
          else await fs.unlink(change.absolute);
        }
      }
      completed.push(change.file);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}${completed.length ? `. Completed before failure: ${completed.join(', ')}` : ''}`, { cause: error });
    }
  }
}
