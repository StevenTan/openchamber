import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const ID = 'openchamber-turn-diffs';
const definition = {
  id: ID,
  methods: {
    read: {
      input: { type: 'object', properties: { sessionID: { type: 'string' }, turnID: { type: 'string' } }, required: ['sessionID', 'turnID'], additionalProperties: false },
      output: { type: 'object' },
    },
  },
  events: {},
};

const expandPath = (file, directory) => path.resolve(directory, file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file);
const displayPath = (file, directory) => {
  const relative = path.relative(directory, file);
  return relative.startsWith(`..${path.sep}`) || relative === '..' ? file : relative.split(path.sep).join('/');
};
const toolPaths = (tool, input, directory) => {
  if (tool === 'write' || tool === 'edit') return [expandPath(input.path, directory)];
  if (tool !== 'patch') return [];
  return [...new Set([...input.patchText.matchAll(/^\*\*\* (?:Add File:|Update File:|Delete File:|Move to:) (.+)\r?$/gm)]
    .map((match) => expandPath(match[1].replace(/\r$/, ''), directory)))];
};

const exists = async (file) => {
  try { await fs.stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};

const diffFile = async (baseline, file, directory, empty) => {
  const present = await exists(file);
  if (!baseline.existed && !present) return null;
  const current = present ? await fs.realpath(file) : empty;
  const args = ['-c', 'core.quotePath=false', 'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--text', '--no-color', '--unified=3', '--', baseline.original, current];
  const output = await new Promise((resolve, reject) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
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
  const status = !baseline.existed ? 'added' : !present ? 'deleted' : 'modified';
  const oldPath = baseline.existed ? `a/${display}` : '/dev/null';
  const newPath = present ? `b/${display}` : '/dev/null';
  return { file: display, status, patch: `diff --git a/${display} b/${display}\n--- ${oldPath}\n+++ ${newPath}\n${body}`, additions, deletions };
};

const recordKey = (sessionID, turnID) => `turn:${sessionID}:${turnID}`;
const activeKey = (sessionID, turnID) => `active:${sessionID}:${turnID}`;
const callKey = ({ sessionID, messageID, id }) => JSON.stringify([sessionID, messageID, id]);

const isAsyncQuestionAnswer = (message) => {
  if (message.type !== 'synthetic' || message.metadata?.source !== 'openchamber-async-question') return false;
  try {
    const body = JSON.parse(message.text);
    if (body.type !== 'async_question_response') return false;
    return (body.responses ?? [body]).some((reply) => reply.status === 'answered' && reply.answers.length > 0);
  } catch { return false; }
};

export default {
  id: ID,
  setup: async (ctx) => {
    const directory = ctx.location.directory;
    const queues = new Map();
    const calls = new Map();
    const scripts = new Map();
    const turns = new Map();
    const anchors = new Map();
    const controller = new AbortController();
    const serial = (sessionID, run) => {
      const next = (queues.get(sessionID) ?? Promise.resolve()).catch(() => {}).then(run);
      queues.set(sessionID, next);
      void next.finally(() => { if (queues.get(sessionID) === next) queues.delete(sessionID); }).catch(() => {});
      return next;
    };
    const scan = async (prefix) => {
      const entries = [];
      let after;
      do {
        const query = { prefix };
        if (after) query.after = after;
        const page = await ctx.storage.scan(query);
        entries.push(...page.entries);
        after = page.next;
      } while (after);
      return entries;
    };
    const anchorFor = async (sessionID, messageID) => {
      const cached = anchors.get(sessionID);
      if (cached?.messageID === messageID) return cached.turnID;
      const messages = await ctx.session.context({ sessionID });
      let turnID, noticeID, answered = false;
      for (const message of messages) {
        if (message.id === messageID) break;
        if (message.type === 'user' || message.type === 'compaction' || isAsyncQuestionAnswer(message)) {
          turnID = message.id;
          noticeID = undefined;
          answered = false;
        } else if (message.type === 'assistant') {
          if (noticeID) turnID = noticeID;
          noticeID = undefined;
          answered = message.finish === 'stop';
        } else if (answered) noticeID = message.id;
      }
      turnID = noticeID ?? turnID;
      if (!turnID) throw new Error('File change has no turn anchor');
      anchors.set(sessionID, { messageID, turnID });
      return turnID;
    };
    const getTurn = async (sessionID, turnID) => {
      const key = activeKey(sessionID, turnID);
      if (turns.has(key)) return turns.get(key);
      let turn = await ctx.storage.get(key);
      if (!turn) {
        const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), `${ID}-`));
        await fs.chmod(temporaryDirectory, 0o700);
        await fs.writeFile(path.join(temporaryDirectory, 'empty'), '', { mode: 0o600 });
        turn = { sessionID, turnID, directory, temporaryDirectory, files: {}, revision: 0 };
      }
      turns.set(key, turn);
      return turn;
    };
    const summary = (record) => ({
      turnID: record.turnID, revision: record.revision,
      files: record.files.map(({ patch: _patch, ...file }) => file),
    });
    const save = async (turn) => {
      const record = { version: 1, sessionID: turn.sessionID, turnID: turn.turnID, revision: ++turn.revision, files: [] };
      for (const [file, baseline] of Object.entries(turn.files)) {
        try {
          if (baseline.error) throw new Error(baseline.error);
          const diff = await diffFile(baseline, file, turn.directory, path.join(turn.temporaryDirectory, 'empty'));
          if (diff) record.files.push(diff);
        } catch (error) { record.files.push({ file: displayPath(file, turn.directory), status: 'modified', error: error.message }); }
      }
      await ctx.storage.set(recordKey(turn.sessionID, turn.turnID), record);
      await ctx.storage.set(activeKey(turn.sessionID, turn.turnID), { ...turn, dirty: false });
      turn.dirty = false;
      return record;
    };
    const settleCapture = async (key, capture) => {
      calls.delete(key);
      let metadata;
      try {
        if (capture.error) throw new Error(capture.error);
        metadata = summary(await save(capture.turn));
      } catch (error) {
        metadata = { error: error.message };
        if (capture.turn) {
          metadata.turnID = capture.turn.turnID;
          metadata.files = Object.keys(capture.turn.files).map((file) => ({ file: displayPath(file, capture.turn.directory), status: 'modified' }));
        }
        console.error('[turn-diffs] capture failed:', error.message);
      }
      const script = scripts.get(key);
      if (script) script.diff = metadata;
      return metadata;
    };
    const finish = async (sessionID, deleted = false) => {
      anchors.delete(sessionID);
      for (const [key, capture] of calls) {
        if (capture.sessionID !== sessionID) continue;
        if (!deleted && scripts.has(key)) await settleCapture(key, capture);
        else calls.delete(key);
      }
      for (const [key, script] of scripts) if (script.sessionID === sessionID) scripts.delete(key);
      for (const { key, value } of await scan(`active:${sessionID}:`)) {
        // The last settled tool already persisted the actual file bytes as a patch.
        // Reading the workspace here could include later unrelated changes.
        const current = turns.get(key) ?? value;
        const record = await ctx.storage.get(recordKey(sessionID, value.turnID));
        if (!deleted && (current.dirty || !record || record.files.some((file) => file.error))) continue;
        await ctx.storage.remove(key);
        turns.delete(key);
        await fs.rm(value.temporaryDirectory, { recursive: true, force: true });
      }
    };
    await ctx.tool.hook('execute.before', async (event) => {
      if (event.tool === 'execute') {
        scripts.set(callKey(event), { sessionID: event.sessionID });
        return;
      }
      if (!['write', 'edit', 'patch'].includes(event.tool)) return;
      await serial(event.sessionID, async () => {
        const key = callKey(event);
        const capture = calls.get(key) ?? { sessionID: event.sessionID, pending: 0 };
        capture.pending++;
        calls.set(key, capture);
        try {
          const turn = await getTurn(event.sessionID, await anchorFor(event.sessionID, event.messageID));
          capture.turn = turn;
          turn.dirty = true;
          for (const file of toolPaths(event.tool, event.input, directory)) {
            if (turn.files[file]) continue;
            const original = path.join(turn.temporaryDirectory, `${Object.keys(turn.files).length}`);
            const baseline = { original, existed: false };
            turn.files[file] = baseline;
            try {
              await fs.copyFile(file, original);
              baseline.existed = true;
              await fs.chmod(original, 0o600);
            } catch (error) {
              if (error.code === 'ENOENT') await fs.writeFile(original, '', { mode: 0o600 });
              else baseline.error = error.message;
            }
          }
          await ctx.storage.set(activeKey(event.sessionID, turn.turnID), turn);
        } catch (error) { capture.error = error.message; }
      });
    });
    await ctx.tool.hook('execute.after', async (event) => {
      if (event.tool === 'execute') {
        await serial(event.sessionID, async () => {
          const key = callKey(event);
          const capture = calls.get(key);
          if (capture) await settleCapture(key, capture);
          const script = scripts.get(key);
          scripts.delete(key);
          if (script?.diff) {
            const result = event.status === 'completed' ? event.result : event.error;
            result.metadata = { ...result.metadata, openchamberTurnDiff: script.diff };
          }
        });
        return;
      }
      if (!['write', 'edit', 'patch'].includes(event.tool)) return;
      await serial(event.sessionID, async () => {
        const capture = calls.get(callKey(event));
        if (!capture) return;
        if (--capture.pending > 0) return;
        const metadata = await settleCapture(callKey(event), capture);
        const result = event.status === 'completed' ? event.result : event.error;
        result.metadata = { ...result.metadata, openchamberTurnDiff: metadata };
      });
    });
    await ctx.rpc.register(definition, {
      read: async ({ sessionID, turnID }) => serial(sessionID, async () => {
        await ctx.session.get({ sessionID });
        const active = turns.get(activeKey(sessionID, turnID)) ?? await ctx.storage.get(activeKey(sessionID, turnID));
        if (active?.dirty) return { version: 1, sessionID, turnID, unavailable: true };
        const record = await ctx.storage.get(recordKey(sessionID, turnID));
        return record ?? { version: 1, sessionID, turnID, unavailable: true };
      }),
    });
    const events = (async () => {
      for await (const event of ctx.event.subscribe({ types: ['session.step.started', 'session.execution.succeeded', 'session.execution.failed', 'session.execution.interrupted', 'session.deleted'], signal: controller.signal })) {
        const sessionID = event.data.sessionID;
        if (event.type === 'session.execution.interrupted' && event.data.reason === 'shutdown') continue;
        try {
          await serial(sessionID, async () => {
            if (event.type === 'session.step.started') {
              const turnID = await anchorFor(sessionID, event.data.assistantMessageID);
              if (!await ctx.storage.get(recordKey(sessionID, turnID))) {
                await ctx.storage.set(recordKey(sessionID, turnID), { version: 1, sessionID, turnID, revision: 0, files: [] });
              }
              return;
            }
            await finish(sessionID, event.type === 'session.deleted');
            if (event.type === 'session.deleted') {
              for (const { key } of await scan(`turn:${sessionID}:`)) await ctx.storage.remove(key);
            }
          });
        } catch (error) { console.error('[turn-diffs] finalization failed:', error.message); }
      }
    })().catch((error) => { if (!controller.signal.aborted) console.error('[turn-diffs] event stream failed:', error.message); });
    return async () => {
      controller.abort();
      await events;
      await Promise.allSettled(queues.values());
    };
  },
};
