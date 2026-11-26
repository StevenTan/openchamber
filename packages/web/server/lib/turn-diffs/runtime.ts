import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { recordedTurnDiffSchema, type TurnDiffReference } from '@openchamber/sdk/agent-backends';
import { isMissingFileError } from '../share-pages/file-errors.js';
import type { ConversationStorage } from '../agent-backends/conversation-storage.js';

export const turnContext = z.object({ sessionID: z.string().min(1), turnID: z.string().min(1), directory: z.string() });
const baselineSchema = z.object({ original: z.string(), existed: z.boolean(), error: z.string().optional() });
const activeSchema = turnContext.extend({ temporaryDirectory: z.string(), files: z.record(z.string(), baselineSchema), revision: z.number(), dirty: z.boolean().optional() });
type Baseline = z.infer<typeof baselineSchema>;
type Turn = z.infer<typeof activeSchema>;
type Record = z.infer<typeof recordedTurnDiffSchema>;
export type TurnContext = z.infer<typeof turnContext>;
const displayPath = (file: string, directory: string) => {
  const relative = path.relative(directory, file);
  return relative.startsWith(`..${path.sep}`) || relative === '..' ? file : relative.split(path.sep).join('/');
};
const exists = async (file: string) => {
  try { await fs.stat(file); return true; } catch (error) { if (isMissingFileError(error)) return false; throw error; }
};

const diffFile = async (baseline: Baseline, file: string, directory: string, empty: string) => {
  const present = await exists(file);
  if (!baseline.existed && !present) return null;
  const current = present ? await fs.realpath(file) : empty;
  const args = ['-c', 'core.quotePath=false', 'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--text', '--no-color', '--unified=3', '--', baseline.original, current];
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => code === 0 || (code === 1 && stderr.length === 0)
      ? resolve(Buffer.concat(stdout).toString('utf8'))
      : reject(new Error(Buffer.concat(stderr).toString('utf8') || `git diff exited ${code}`)));
  });
  if (!output && baseline.existed === present) return null;
  const display = displayPath(file, directory);
  const lines = output.split('\n');
  const firstHunk = lines.findIndex((line) => line.startsWith('@@ '));
  const body = firstHunk === -1 ? '' : lines.slice(firstHunk).join('\n');
  const additions = body.split('\n').filter((line) => line.startsWith('+')).length;
  const deletions = body.split('\n').filter((line) => line.startsWith('-')).length;
  const status: 'added' | 'deleted' | 'modified' = !baseline.existed ? 'added' : !present ? 'deleted' : 'modified';
  const oldPath = baseline.existed ? `a/${display}` : '/dev/null';
  const newPath = present ? `b/${display}` : '/dev/null';
  return { file: display, status, patch: `diff --git a/${display} b/${display}\n--- ${oldPath}\n+++ ${newPath}\n${body}`, additions, deletions };
};

export function createTurnDiffRuntime(dataDir: string, changed: (sessionID: string, reference: TurnDiffReference) => Promise<void>, storage: ConversationStorage) {
  const root = path.join(dataDir, 'turn-diffs');
  const active = new Map<string, TurnContext>();
  const turns = new Map<string, Turn>();
  const pending = new Map<Turn, number>();
  const queues = new Map<string, Promise<unknown>>();
  const sessionPath = (sessionID: string) => path.join(root, encodeURIComponent(sessionID));
  const activePath = ({ sessionID, turnID }: Pick<TurnContext, 'sessionID' | 'turnID'>) => path.join(sessionPath(sessionID), 'active', encodeURIComponent(turnID));
  const key = ({ sessionID, turnID }: Pick<TurnContext, 'sessionID' | 'turnID'>) => JSON.stringify([sessionID, turnID]);
  const readJson = async <Value>(file: string, schema: z.ZodType<Value>): Promise<Value | undefined> => {
    try { return schema.parse(JSON.parse(await fs.readFile(file, 'utf8'))); }
    catch (error) { if (isMissingFileError(error)) return undefined; throw error; }
  };
  const writeJson = async (file: string, value: Turn | Record) => {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, JSON.stringify(value), { mode: 0o600 });
  };
  const serial = <Value>(sessionID: string, run: () => Promise<Value>) => {
    const next = (queues.get(sessionID) ?? Promise.resolve()).catch(() => {}).then(run);
    queues.set(sessionID, next);
    void next.finally(() => { if (queues.get(sessionID) === next) queues.delete(sessionID); }).catch(() => {});
    return next;
  };
  const summary = (record: Record): TurnDiffReference => ({ turnID: record.turnID, revision: record.revision,
    files: record.files?.map(({ patch: _patch, ...file }) => file) });
  const load = async (context: TurnContext): Promise<Turn> => {
    const cached = turns.get(key(context));
    if (cached) return cached;
    const stored = await readJson(path.join(activePath(context), 'manifest.json'), activeSchema);
    const temporaryDirectory = path.join(activePath(context), 'originals');
    await fs.mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(temporaryDirectory, 'empty'), '', { mode: 0o600 });
    const turn = stored ?? { ...context, temporaryDirectory, files: {}, revision: 0 };
    turns.set(key(context), turn);
    return turn;
  };
  const save = async (turn: Turn) => {
    const record: Record = { version: 1, sessionID: turn.sessionID, turnID: turn.turnID, revision: ++turn.revision, files: [], directory: turn.directory };
    const files = [];
    for (const [file, baseline] of Object.entries(turn.files)) {
      try {
        if (baseline.error) throw new Error(baseline.error);
        const diff = await diffFile(baseline, file, turn.directory, path.join(turn.temporaryDirectory, 'empty'));
        if (diff) files.push(diff);
      } catch (error) { files.push({ file: displayPath(file, turn.directory), status: 'modified' as const, error: (error instanceof Error ? error.message : String(error)) }); }
    }
    record.files = files;
    storage.saveDiff(record);
    await writeJson(path.join(activePath(turn), 'manifest.json'), { ...turn, dirty: false });
    turn.dirty = false;
    return summary(record);
  };
  return {
    current: (sessionID: string) => active.get(sessionID),
    begin: (context: TurnContext) => serial(context.sessionID, async () => {
      active.set(context.sessionID, context);
      if (!storage.diff(context.sessionID, context.turnID)) storage.saveDiff({ version: 1, sessionID: context.sessionID, turnID: context.turnID, revision: 0, files: [], directory: context.directory });
    }),
    before: (sessionID: string, paths: string[]) => serial(sessionID, async () => {
      let turn: Turn | undefined;
      try {
        const context = active.get(sessionID);
        if (!context) throw new Error('File change has no turn anchor');
        turn = await load(context);
        pending.set(turn, (pending.get(turn) ?? 0) + 1);
        turn.dirty = true;
        for (const file of paths) {
          if (turn.files[file]) continue;
          const original = path.join(turn.temporaryDirectory, `${Object.keys(turn.files).length}`);
          const baseline: Baseline = { original, existed: false };
          turn.files[file] = baseline;
          try {
            await fs.copyFile(file, original);
            baseline.existed = true;
            await fs.chmod(original, 0o600);
          } catch (error) {
            if (isMissingFileError(error)) await fs.writeFile(original, '', { mode: 0o600 });
            else baseline.error = (error instanceof Error ? error.message : String(error));
          }
        }
        await writeJson(path.join(activePath(turn), 'manifest.json'), turn);
        return { sessionID, turn };
      } catch (error) { return { sessionID, turn, error: (error instanceof Error ? error.message : String(error)) }; }
    }),
    after: (capture: { sessionID: string; turn?: Turn | undefined; error?: string | undefined }) => serial(capture.sessionID, async () => {
      const turn = capture.turn;
      let reference: TurnDiffReference;
      try {
        if (turn) pending.set(turn, (pending.get(turn) ?? 1) - 1);
        if (capture.error) throw new Error(capture.error);
        if (!turn) throw new Error('File change has no turn anchor');
        if (pending.get(turn)) return { turnID: turn.turnID, revision: turn.revision };
        pending.delete(turn);
        reference = await save(turn);
      } catch (error) {
        reference = { error: (error instanceof Error ? error.message : String(error)), ...turn && { turnID: turn.turnID,
          files: Object.keys(turn.files).map(file => ({ file: displayPath(file, turn.directory), status: 'modified' as const })) } };
      }
      await changed(capture.sessionID, reference);
      return reference;
    }),
    read: (sessionID: string, turnID: string) => serial(sessionID, async () => {
      const context = { sessionID, turnID };
      const current = turns.get(key(context)) ?? await readJson(path.join(activePath(context), 'manifest.json'), activeSchema);
      if (current?.dirty) return { version: 1 as const, sessionID, turnID, unavailable: true };
      return storage.diff(sessionID, turnID) ?? { version: 1 as const, sessionID, turnID, unavailable: true };
    }),
    finish: (sessionID: string) => serial(sessionID, async () => {
      active.delete(sessionID);
      const directory = path.join(sessionPath(sessionID), 'active');
      if (!await exists(directory)) return;
      for (const name of await fs.readdir(directory)) {
        const manifest = path.join(directory, name, 'manifest.json');
        const stored = activeSchema.parse(await readJson(manifest, activeSchema));
        const current = turns.get(key(stored)) ?? stored;
        const record = storage.diff(stored.sessionID, stored.turnID);
        if (current.dirty || !record || record.files?.some(file => file.error)) continue;
        await fs.rm(path.dirname(manifest), { recursive: true });
        turns.delete(key(stored));
      }
    }),
    remove: (sessionID: string) => serial(sessionID, async () => {
      active.delete(sessionID);
      for (const [id, turn] of turns) if (turn.sessionID === sessionID) { turns.delete(id); pending.delete(turn); }
      await fs.rm(sessionPath(sessionID), { recursive: true, force: true });
      storage.clearDiffs(sessionID);
    }),
    import: async (entries: Array<{ key: string; value: unknown }>) => {
      for (const entry of entries) {
        if (entry.key.startsWith('turn:')) {
          const record = recordedTurnDiffSchema.parse(entry.value);
          await serial(record.sessionID, async () => { if (!storage.diff(record.sessionID, record.turnID)) storage.saveDiff(record); });
        } else {
          const turn = activeSchema.parse(entry.value);
          await serial(turn.sessionID, async () => {
            const manifest = path.join(activePath(turn), 'manifest.json');
            if (await exists(manifest)) return;
            const originals = path.join(activePath(turn), 'originals');
            await fs.cp(turn.temporaryDirectory, originals, { recursive: true });
            for (const baseline of Object.values(turn.files)) baseline.original = path.join(originals, path.basename(baseline.original));
            turn.temporaryDirectory = originals;
            await writeJson(manifest, turn);
          });
        }
      }
    },
    close: () => Promise.allSettled(queues.values()),
  };
}

