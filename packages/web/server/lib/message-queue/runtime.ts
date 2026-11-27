import type { MessageQueueOptions } from './options.js';
export type { MessageQueueOptions } from './options.js';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { isString } from '../shared/object-guards.js';
import type { GlobalStreamEvent } from '../event-stream/global-hub.js';
import type { ScheduledTaskProvenance } from '../scheduled-tasks/existing-session.js';
import type { ScheduledTaskInput, ScheduledTaskStatus } from '../projects/contracts.js';
import type { RoutingModelRef } from '../routing/contracts.js';
import { createMessageId } from '../dispatch-results/runtime.js';
import { assertPromptResponse } from '../opencode/prompt-response.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { attachmentHint } from '../routing/runtime.js';
import { buildGoalIntroText, createSessionGoal } from '../session-goal/create.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { JsonObject, JsonValue } from '../shared/json-values.js';
import type { ModelCatalogEntry } from './opencode-types.js';
import { conversationContext } from '../agent-backends/prompt-schema.js';
import type { QueuedAttachment, QueuedContextPart, QueuedItem, SessionQueue, MessageQueueSessionSnapshot } from './contracts.js';
export type { QueueSendConfig, QueuedGoal, QueuedAttachment, QueuedContextPart, QueuedItemInput, QueuedItem, PublicQueuedItem, SessionQueue, MessageQueueSessionSnapshot } from './contracts.js';

import { asNonEmptyString, asRecord, asList, asCount, hasReadableFields, isList, textSchema, listSchema, queuedItemInputSchema, parseStoredItem, toPublicItem, extractSessionStatus, extractAssistantMessageUpdate, extractAbortedSessionId, extractDeletedSessionId, extractSessionDirectoryUpdate, type QueueRecord, parseQueuedItemInput } from './records.js';
export { parseQueuedItemInput } from './records.js';
export type { QueueRecord } from './records.js';
export { registerMessageQueueRoutes } from './routes.js';

const QUEUE_FILE_NAME = 'message-queue.json';
const QUEUE_FILE_VERSION = 1;

const MAX_SESSIONS = 50;
const MAX_ITEMS_PER_SESSION = 20;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

const DISPATCH_QUIET_MS = 500;
const ABORT_HOLD_MS = 2_000;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const MESSAGE_TAIL_LIMIT = 2;

const getQueuedSendRetryDelayMs = (failures: number) =>
  Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const isScheduledItem = (item: QueuedItem): item is QueuedItem & { scheduledTask: ScheduledTaskProvenance } => Boolean(item.scheduledTask);

interface QueueModel {
  id: string | undefined;
  providerID: string | undefined;
  variant?: string;
}

type PromptFile = {
  uri: string;
  mime: string;
  name?: string;
};

interface OpenCodeFetchOptions {
  directory?: string | undefined;
  method?: string;
  body?: QueueRecord | Uint8Array<ArrayBuffer>;
  query?: Record<string, string>;
}

const hasSelectedModel = (model: QueueModel): model is QueueModel & RoutingModelRef => Boolean(model.providerID && model.id);

const isValidSessionId = (value: string | undefined): value is string => SESSION_ID_PATTERN.test(asNonEmptyString(value));

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

export function createMessageQueueRuntime({
  globalEventHub,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  sessionKnowledgeRuntime = null,
  broadcastGlobalUiEvent,
  onPromptSent,
  beforeScheduledTaskSend,
  validateScheduledTaskTarget,
  onScheduledTaskResult,
  resolveAutoSelection = null,
  persistSessionGoal = null,
  isDeliveryHeld = () => false,
  deliveryHoldReady = Promise.resolve(),
  dataDir,
  fetchImpl = fetch,
  now = Date.now,
  dispatchQuietMs = DISPATCH_QUIET_MS,
  abortHoldMs = ABORT_HOLD_MS,
  retryDelayMs = getQueuedSendRetryDelayMs,
  backendForSession,
  deliver,
  onPromptCancelled,
}: MessageQueueOptions) {
  const filePath = path.join(dataDir, QUEUE_FILE_NAME);

  const queues = new Map<string, SessionQueue>();
  let revision = 0;
  let loadPromise: Promise<void> | null = null;
  let writePromise = Promise.resolve();
  let stopped = false;

  const runtimeStartedAt = now();

  const sending = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failures = new Map<string, { itemId: string; failures: number; nextAttemptAt: number }>();
  const abortedAt = new Map<string, number>();
  const directories = new Map<string, string | undefined>();

  const serialize = () => ({
    version: QUEUE_FILE_VERSION,
    revision,
    sessions: Object.fromEntries(
      Array.from(queues.entries()).map(([sessionId, queue]) => [sessionId, { directory: queue.directory, items: queue.items }]),
    ),
  });

  const readFile = async () => {
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (asRecord(error)?.code === 'ENOENT') return { sessions: {}, revision: 0 };
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[message-queue] queue file was unreadable and moved to ${backup}: ${(hasReadableFields(error) ? error.message : undefined) ?? error}`);
      return { sessions: {}, revision: 0 };
    }
    const stored = asRecord(parsed) ?? {};
    const sessions: Record<string, SessionQueue> = {};
    for (const [sessionId, value] of Object.entries(asRecord(stored.sessions) ?? {})) {
      const entry = asRecord(value);
      if (!entry || !isValidSessionId(sessionId)) continue;
      const directory = asNonEmptyString(entry.directory);
      const items = (asList(entry.items) ?? []).map((entry) => parseStoredItem(entry)).filter((item) => item !== null);
      if (!directory || items.length === 0) continue;
      sessions[sessionId] = { directory, items };
    }
    return { sessions, revision: asCount(stored.revision) ?? 0 };
  };

  const load = () => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const [sessionId, entry] of Object.entries(stored.sessions)) queues.set(sessionId, entry);
          revision = Math.max(revision, stored.revision);
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = () => {
    const payload = JSON.stringify(serialize());
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[message-queue] failed to persist queue:', error?.message ?? error);
    });
    return write;
  };

  const sessionSnapshot = (sessionId: string): MessageQueueSessionSnapshot => {
    const queue = queues.get(sessionId);
    return {
      sessionId,
      directory: queue?.directory ?? directories.get(sessionId) ?? '',
      items: (queue?.items ?? []).filter(item => !(item.prompt || item.contextInput)).map(toPublicItem),
      sendingId: sending.get(sessionId) ?? null,
    };
  };

  const snapshot = () => ({
    revision,
    sessions: Array.from(queues.keys()).map(sessionSnapshot),
  });

  const broadcast = (sessionId: string) => {
    broadcastGlobalUiEvent?.({
      type: 'openchamber:message-queue.updated',
      properties: { revision, session: sessionSnapshot(sessionId) },
    });
  };

  const commit = (sessionId: string) => {
    revision += 1;
    persist().catch(() => undefined);
    broadcast(sessionId);
    return { revision, session: sessionSnapshot(sessionId) };
  };

  const reportScheduledResult = (item: QueuedItem, status: ScheduledTaskStatus, cause?: unknown) => {
    if (!isScheduledItem(item)) return;
    Promise.resolve().then(() => onScheduledTaskResult?.(item.scheduledTask, status, cause))
      .catch((failure) => console.warn('[message-queue] scheduled task state write failed:', failure?.message ?? failure));
  };

  const setQueueItems = (sessionId: string, directory: string | undefined, items: QueuedItem[], status: ScheduledTaskStatus = 'cancelled', cause?: unknown) => {
    for (const item of queues.get(sessionId)?.items ?? []) {
      if (item.scheduledTask && !items.some((entry) => entry.id === item.id)) reportScheduledResult(item, status, cause);
      if ((item.prompt || item.contextInput) && status === 'cancelled' && !items.some(entry => entry.id === item.id)) onPromptCancelled?.(sessionId, item, directory ?? '');
    }
    directories.set(sessionId, directory);
    if (items.length === 0) {
      queues.delete(sessionId);
      return;
    }
    if (directory === undefined) throw new Error('Message queue directory is missing');
    queues.set(sessionId, { directory, items });
  };

  function openCodeFetch(fetchPath: '/api/model', options?: OpenCodeFetchOptions): Promise<ModelCatalogEntry[]>;
  function openCodeFetch(fetchPath: '/api/info' | '/api/experimental/fs/write', options?: OpenCodeFetchOptions): Promise<JsonObject | null | undefined>;
  function openCodeFetch(fetchPath: string, options?: OpenCodeFetchOptions): Promise<ReturnType<typeof unwrapOpenCodeResponse>>;
  async function openCodeFetch(fetchPath: string, { directory, method = 'GET', body, query }: OpenCodeFetchOptions = {}): Promise<JsonValue | ModelCatalogEntry[] | undefined> {
    const base = buildOpenCodeUrl(fetchPath, '');
    const params = new URLSearchParams(query || {});
    if (directory) params.set('directory', directory);
    const search = params.toString();
    const headers: ReturnType<MessageQueueOptions['getOpenCodeAuthHeaders']> = { Accept: 'application/json', ...getOpenCodeAuthHeaders() };
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    if (body) {
      headers['Content-Type'] = body instanceof Uint8Array ? 'application/octet-stream' : 'application/json';
      init.body = body instanceof Uint8Array ? body : JSON.stringify(body);
    }
    const response = await fetchImpl(search ? `${base}?${search}` : base, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw httpError(`OpenCode ${method} ${fetchPath} failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, response.status);
    }
    if (method === 'POST') {
      await assertPromptResponse(response, 'OpenCode dispatch');
    }
    return unwrapOpenCodeResponse(await response.json().catch(() => null));
  }

  const isSessionIdle = async (sessionId: string, directory: string | undefined) => {
    const backend = backendForSession?.(sessionId);
    if (backend) return backend.isIdle();
    const body = asRecord(await openCodeFetch('/api/session/active').catch(() => null));
    const statuses = asRecord(body && 'data' in body ? body.data : body);
    if (!statuses) return null;
    if (asRecord(statuses[sessionId])) return false;
    const page = await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/message`, {
      directory,
      query: { limit: String(MESSAGE_TAIL_LIMIT) },
    }).catch(() => null);
    const messages = asList(asRecord(page)?.data);
    if (!messages) return null;
    const last = asRecord(messages[0]);
    const lastTime = asRecord(last?.time);
    if (last?.type === 'assistant' && asCount(lastTime?.completed) === null) {
      const created = asCount(lastTime?.created);
      if (created === null || created >= runtimeStartedAt) return false;
      console.log(`[message-queue] ignoring pre-boot unfinished tail for ${sessionId}`);
    }
    return true;
  };

  const resolveSlashCommand = async (text: string, directory: string | undefined) => {
    if (!text.startsWith('/')) return null;
    const [head = '', ...tail] = text.split(' ');
    const name = head.slice(1);
    if (!name) return null;
    const commands = asList(await openCodeFetch('/api/command', { directory })) ?? [];
    const match = commands.map((command) => asRecord(command)).find((command) => command?.name === name);
    if (!match) return null;
    return {
      name,
      arguments: tail.join(' '),
    };
  };

  const toPromptFile = (attachment: QueuedAttachment) => {
    const file: PromptFile = { uri: attachment.dataUrl, mime: attachment.mimeType };
    if (attachment.agentPath || attachment.filename) file.name = attachment.agentPath || attachment.filename;
    return file;
  };

  const preparePromptFiles = async (attachments: QueuedAttachment[], model: QueueModel, directory: string) => {
    let input: unknown[] | null = null;
    if (attachments.some((file) => file.mimeType.startsWith('image/'))) {
      const models = await openCodeFetch('/api/model', { directory });
      if (!asList(models)) throw new Error('Invalid OpenCode model catalog');
      const selected = models.find((entry) => entry.providerID === model.providerID && entry.modelID === model.id);
      input = asList(asRecord(selected?.capabilities)?.input);
    }
    return Promise.all(attachments.map(async (file) => {
      if (file.mimeType.startsWith('image/') && (!input || input.includes('image'))) return toPromptFile(file);
      let filePath = file.agentPath || (file.dataUrl.startsWith('file://') ? fileURLToPath(file.dataUrl) : null);
      if (!filePath) {
        if (!file.dataUrl.startsWith('data:')) throw new Error('Attachment has no readable file path');
        const bytes = new Uint8Array(await (await fetch(file.dataUrl)).arrayBuffer());
        const info = await openCodeFetch('/api/info', { directory });
        const tmp = asNonEmptyString(asRecord(info?.paths)?.tmp);
        if (!tmp) throw new Error('OpenCode temp directory is unavailable');
        const name = Array.from(path.posix.basename(file.filename.replace(/\\/g, '/')),
          (char) => char.charCodeAt(0) < 32 || ':<>"|?*'.includes(char) ? '-' : char).join('');
        const filename = file.mimeType === 'text/plain' && /\.(docx|pptx|xlsx|odt|odp|ods|ipynb)$/i.test(name) ? `${name}.txt` : name;
        const target = `${tmp.replace(/[\\/]+$/, '')}/openchamber/${randomUUID()}/${filename}`;
        const saved = await openCodeFetch('/api/experimental/fs/write', { directory, method: 'POST', query: { path: target }, body: bytes });
        filePath = asNonEmptyString(saved?.path);
        if (!filePath) throw new Error('OpenCode did not return the saved attachment path');
      }
      const note = `File on disk: ${filePath}. Read this file with your tools. Its binary content is not included in this message.\n`;
      return { uri: `data:text/plain;base64,${Buffer.from(note).toString('base64')}`, name: filePath, mime: 'text/plain' };
    }));
  };

  const toContextMessages = (part: QueuedContextPart) => {
    const body = { text: part.text, resume: false };
    if (part.kind !== 'context') return [body];
    const withMetadata = part.metadata ? { ...body, metadata: part.metadata } : body;
    return part.instructions
      ? [{ text: part.instructions, resume: false }, withMetadata]
      : [withMetadata];
  };

  const ensureSyntheticIds = async (item: QueuedItem, count: number) => {
    if (item.syntheticIds?.length === count) return;
    const firstAt = now() - count + 1;
    item.syntheticIds = Array.from({ length: count }, (_, index) => createMessageId(firstAt + index));
    try {
      await persist();
    } catch (error) {
      delete item.syntheticIds;
      throw error;
    }
  };

  const sendItem = async (sessionId: string, directory: string, item: QueuedItem) => {
    if (item.contextInput) return deliver(sessionId, directory, { type: 'context', context: { ...item.contextInput, delivery: 'steer' } });
    if (item.prompt) return deliver(sessionId, directory, { type: 'prompt', prompt: { ...item.prompt, delivery: undefined }, selection: item.sendConfig });
    if (backendForSession?.(sessionId)) {
      if (item.goal) throw httpError('This backend does not support goal mode', 400);
      const { agent: _agent, ...selection } = item.sendConfig;
      if (sessionKnowledgeRuntime) await sessionKnowledgeRuntime.sync(sessionId, directory);
      return deliver(sessionId, directory, { type: 'prompt', source: 'synthetic', selection, prompt: {
        id: item.id, text: item.text, agents: [], skills: [],
        context: item.context.flatMap(toContextMessages).map(part => conversationContext.parse(part)),
        files: item.attachments.map(file => { const filename = file.agentPath ?? file.serverPath; return { mime: file.mimeType, filename: file.filename, url: filename ? pathToFileURL(filename).href : file.dataUrl }; }),
      } });
    }
    const { providerID, modelID, variant } = item.sendConfig;
    let agent = item.sendConfig.agent;
    let model: QueueModel = { id: modelID, providerID };
    if (variant) model.variant = variant;
    let promptFiles = item.attachments.map(toPromptFile);
    const synthetics = [
      ...item.context.flatMap(toContextMessages),
      ...(item.goal ? [{ text: buildGoalIntroText(item.goal.tokenBudget), resume: false }] : []),
    ];

    const routed = hasSelectedModel(model) ? await resolveAutoSelection?.({
      sessionId,
      directory,
      model,
      agent,
      requestText: `${item.text}${attachmentHint({ files: promptFiles })}`.trim(),
    }) : null;
    if (routed) {
      model = routed.model;
      agent = routed.agent ?? agent;
    }
    promptFiles = await preparePromptFiles(item.attachments, model, directory);

    const command = await resolveSlashCommand(item.text, directory);

    if (sessionKnowledgeRuntime) await sessionKnowledgeRuntime.sync(sessionId, directory);

    if (synthetics.length > 0) {
      await ensureSyntheticIds(item, synthetics.length);
      const session = asRecord(await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}`, { directory }));
      if (!session) throw new Error(`OpenCode returned no record for session ${sessionId}`);
      if (session.revert) {
        await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/revert/commit`, { directory, method: 'POST' });
      }
    }

    if (item.goal) {
      await createSessionGoal({
        persistSessionGoal,
        sessionID: sessionId,
        directory,
        objective: item.goal.objective || item.text,
        tokenBudget: item.goal.tokenBudget,
        providerID: model.providerID,
        modelID: model.id,
        onWarning: (message: string, cause: unknown) => console.warn(`[message-queue] ${message}:`, (hasReadableFields(cause) ? cause.message : undefined) || cause),
      });
    }

    await deliver(sessionId, directory, {
      type: 'prompt', source: 'synthetic',
      selection: { ...model.providerID && { providerID: model.providerID }, ...model.id && { modelID: model.id }, ...model.variant && { variant: model.variant }, ...agent && { agent } },
      ...command && { command: { name: command.name, text: command.arguments } },
      prompt: {
        id: createMessageId(now()), text: item.text, skills: [],
        files: promptFiles.map(file => ({ url: file.uri, mime: file.mime, ...file.name && { filename: file.name } })),
        agents: item.agentMention ? [{ name: item.agentMention }] : [],
        context: synthetics.map((synthetic, index) => {
          if (!item.syntheticIds) throw new Error('Queued synthetic IDs are missing');
          return conversationContext.parse({ ...synthetic, id: item.syntheticIds[index] });
        }),
      },
    });
  };

  const clearTimer = (sessionId: string) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(sessionId);
    }
  };

  const armDispatch = (sessionId: string, delayMs = dispatchQuietMs) => {
    if (stopped || !queues.has(sessionId)) return;
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      tick(sessionId).catch((error) => {
        console.warn('[message-queue] dispatch tick failed:', error?.message ?? error);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionId, timer);
  };

  async function tick(sessionId: string) {
    if (stopped) return;
    const queue = queues.get(sessionId);
    if (!queue || queue.items.length === 0 || sending.has(sessionId) || isDeliveryHeld(sessionId)) return;

    const abortHoldUntil = (abortedAt.get(sessionId) ?? 0) + abortHoldMs;
    if (abortHoldUntil > now()) {
      armDispatch(sessionId, abortHoldUntil - now());
      return;
    }

    const head = queue.items[0];
    if (!head) throw new Error('Message queue head is missing');
    const failure = failures.get(sessionId);
    if (failure && failure.itemId !== head.id) failures.delete(sessionId);
    else if (failure && failure.nextAttemptAt > now()) {
      armDispatch(sessionId, failure.nextAttemptAt - now());
      return;
    }

    const idle = await isSessionIdle(sessionId, queue.directory);
    if (idle === null) {
      if (head.scheduledTask && validateScheduledTaskTarget) {
        try {
          await validateScheduledTaskTarget(head.scheduledTask.projectId, sessionId);
        } catch (error) {
          if (hasReadableFields(error) && (error.statusCode === 404 || error.statusCode === 409)) {
            const after = queues.get(sessionId);
            if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== head.id), 'failed', error.message);
            commit(sessionId);
            armDispatch(sessionId);
            return;
          }
        }
      }
      armDispatch(sessionId, retryDelayMs(1));
      return;
    }
    if (!idle) return;

    const current = queues.get(sessionId);
    const item = current?.items[0];
    if (!current || !item || item.id !== head.id || sending.has(sessionId)) return;

    sending.set(sessionId, item.id);
    broadcast(sessionId);
    try {
      if (isScheduledItem(item)) {
        try {
          await beforeScheduledTaskSend?.(sessionId, current.directory, item);
        } catch (error) {
          if (!hasReadableFields(error) || (error.statusCode !== 404 && error.statusCode !== 409)) throw error;
          sending.delete(sessionId);
          const after = queues.get(sessionId);
          if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== item.id), 'failed', error.message);
          failures.delete(sessionId);
          commit(sessionId);
          armDispatch(sessionId);
          return;
        }
      }
      await sendItem(sessionId, current.directory, item);
      const after = queues.get(sessionId);
      if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== item.id), 'sent');
      failures.delete(sessionId);
      sending.delete(sessionId);
      commit(sessionId);
      try {
        onPromptSent?.(sessionId);
      } catch {
        void 0;
      }
      console.log(`[message-queue] sent queued message to ${sessionId}`);
    } catch (error) {
      sending.delete(sessionId);
      const count = (failure?.itemId === item.id ? failure.failures : 0) + 1;
      const nextAttemptAt = now() + retryDelayMs(count);
      failures.set(sessionId, { itemId: item.id, failures: count, nextAttemptAt });
      console.warn(`[message-queue] send to ${sessionId} failed (attempt ${count}):`, (hasReadableFields(error) ? error.message : undefined) ?? error);
      broadcast(sessionId);
      armDispatch(sessionId, nextAttemptAt - now());
    }
  }

  const reconcileAll = () => {
    for (const sessionId of queues.keys()) {
      if (!timers.has(sessionId)) armDispatch(sessionId, dispatchQuietMs);
    }
  };

  const requireSessionId = (sessionId: string | undefined) => {
    if (!isValidSessionId(sessionId)) throw new TypeError('sessionId is invalid');
    return sessionId;
  };

  const enqueue = async (sessionIdInput: string | undefined, directoryInput: z.input<typeof textSchema>, itemInput: z.input<typeof queuedItemInputSchema>) => {
    const sessionId = requireSessionId(sessionIdInput);
    const directory = asNonEmptyString(directoryInput);
    if (!directory) throw new TypeError('directory is required');
    const parsed = parseQueuedItemInput(itemInput);
    await load();
    if (parsed.scheduledTask) {
      for (const queue of queues.values()) {
        const provenance = parsed.scheduledTask;
        if (queue.items.some((entry) => entry.scheduledTask?.projectId === provenance.projectId && entry.scheduledTask.taskId === provenance.taskId)) {
          throw httpError('task is already queued', 409);
        }
      }
      if ((queues.get(sessionId)?.items.length ?? 0) >= MAX_ITEMS_PER_SESSION || (!queues.has(sessionId) && queues.size >= MAX_SESSIONS)) {
        throw httpError('message queue is full', 409);
      }
    }
    const item = {
      id: `queued-${now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: now(),
      ...parsed,
    };
    const existing = queues.get(sessionId);
    const items = [...(existing?.items ?? []), item].slice(-MAX_ITEMS_PER_SESSION);
    setQueueItems(sessionId, directory, items);
    directories.set(sessionId, directory);
    if (queues.size > MAX_SESSIONS) {
      const oldest = Array.from(queues.entries())
        .filter(([id]) => id !== sessionId && !sending.has(id))
        .sort((left, right) => (left[1].items[0]?.createdAt ?? 0) - (right[1].items[0]?.createdAt ?? 0))
        .slice(0, queues.size - MAX_SESSIONS);
      for (const [staleId] of oldest) {
        setQueueItems(staleId, directories.get(staleId), []);
        clearTimer(staleId);
        broadcast(staleId);
        directories.delete(staleId);
      }
    }
    const result = commit(sessionId);
    armDispatch(sessionId);
    return { ...result, itemId: item.id };
  };

  const remove = async (sessionIdInput: string | undefined, itemId: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    if (sending.get(sessionId) === itemId) throw httpError('message is being sent', 409);
    const queue = queues.get(sessionId);
    if (!queue || !queue.items.some((item) => item.id === itemId)) {
      return { revision, session: sessionSnapshot(sessionId) };
    }
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id !== itemId));
    return commit(sessionId);
  };

  const take = async (sessionIdInput: string | undefined, itemId: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    if (sending.get(sessionId) === itemId) throw httpError('message is being sent', 409);
    const queue = queues.get(sessionId);
    const item = queue?.items.find((entry) => entry.id === itemId);
    if (!queue || !item) throw httpError('queued message not found', 404);
    if (item.scheduledTask) throw httpError('scheduled messages cannot be taken', 409);
    setQueueItems(sessionId, queue.directory, queue.items.filter((entry) => entry.id !== itemId));
    return { ...commit(sessionId), item };
  };

  const takeAll = async (sessionIdInput: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId), items: [] };
    const sendingId = sending.get(sessionId) ?? null;
    const items = queue.items.filter((item) => item.id !== sendingId && !item.scheduledTask && !(item.prompt || item.contextInput));
    if (items.length === 0) return { revision, session: sessionSnapshot(sessionId), items: [] };
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id === sendingId || item.scheduledTask || item.prompt || item.contextInput));
    return { ...commit(sessionId), items };
  };

  const reorder = async (sessionIdInput: string | undefined, itemIds: z.input<typeof listSchema>) => {
    const sessionId = requireSessionId(sessionIdInput);
    if (!isList(itemIds) || itemIds.some((id) => !asNonEmptyString(id))) {
      throw new TypeError('itemIds must be a list of ids');
    }
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId) };
    const byId = new Map(queue.items.filter(item => !(item.prompt || item.contextInput)).map((item) => [item.id, item]));
    const hasQueuedId = (id: unknown): id is string => isString(id) && byId.has(id);
    if (itemIds.length !== byId.size || new Set(itemIds).size !== itemIds.length || !itemIds.every(hasQueuedId)) {
      throw new TypeError('itemIds must list every queued message exactly once');
    }
    const order = itemIds[Symbol.iterator]();
    queues.set(sessionId, { directory: queue.directory, items: queue.items.map((entry) => {
      if (entry.prompt || entry.contextInput) return entry;
      const item = byId.get(String(order.next().value));
      if (!item) throw new Error('Queued message is missing');
      return item;
    }) });
    return commit(sessionId);
  };

  const clear = async (sessionIdInput: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId) };
    const sendingId = sending.get(sessionId) ?? null;
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id === sendingId || item.prompt || item.contextInput));
    clearTimer(sessionId);
    armDispatch(sessionId);
    return commit(sessionId);
  };

  const release = (sessionId: string) => {
    armDispatch(sessionId);
  };

  const processPayload = z.unknown().transform((value) => {
    const payload = asRecord(value);
    if (stopped || !payload) return;

    const deletedSessionId = extractDeletedSessionId(payload);
    if (deletedSessionId) {
      if (!queues.has(deletedSessionId)) return;
      setQueueItems(deletedSessionId, directories.get(deletedSessionId), []);
      clearTimer(deletedSessionId);
      failures.delete(deletedSessionId);
      commit(deletedSessionId);
      directories.delete(deletedSessionId);
      return;
    }

    const moved = extractSessionDirectoryUpdate(payload);
    if (moved) {
      const queue = queues.get(moved.sessionId);
      if (queue && queue.directory !== moved.directory) {
        setQueueItems(moved.sessionId, moved.directory, queue.items);
        commit(moved.sessionId);
      }
      return;
    }

    const status = extractSessionStatus(payload);
    if (status) {
      if (!queues.has(status.sessionId)) return;
      if (status.type === 'idle') armDispatch(status.sessionId);
      else clearTimer(status.sessionId);
      return;
    }

    const abortedSessionId = extractAbortedSessionId(payload);
    if (abortedSessionId) {
      if (queues.has(abortedSessionId)) abortedAt.set(abortedSessionId, now());
      return;
    }

    const assistant = extractAssistantMessageUpdate(payload);
    if (assistant && queues.has(assistant.sessionId)) {
      if (assistant.completed && !timers.has(assistant.sessionId)) armDispatch(assistant.sessionId);
    }
  }).parse;

  const processEvent = (event: GlobalStreamEvent | null | undefined) => {
    for (const payload of event?.translated?.() ?? []) processPayload(payload);
  };

  const start = () => {
    const unsubscribeEvent = globalEventHub.subscribeEvent(processEvent);
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status?.type === 'connect') reconcileAll();
    });
    void load()
      .then(async () => {
        if (queues.size > 0) console.log(`[message-queue] restored queues for ${queues.size} session(s)`);
        await deliveryHoldReady;
        reconcileAll();
      })
      .catch((error) => {
        console.warn('[message-queue] failed to load queue file:', error?.message ?? error);
      });
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
    };
  };

  const stop = () => {
    stopped = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  const cancelScheduledTask = async (projectId: string, taskId: ScheduledTaskInput['id']) => {
    await load();
    for (const [sessionId, queue] of queues) {
      const items = queue.items.filter((item) => item.scheduledTask?.projectId !== projectId || item.scheduledTask.taskId !== taskId || sending.get(sessionId) === item.id);
      if (items.length === queue.items.length) continue;
      setQueueItems(sessionId, queue.directory, items);
      commit(sessionId);
      armDispatch(sessionId);
    }
  };

  return {
    load,
    sessionStatus: (sessionID: string, type: 'idle' | 'busy') => processPayload({ type: 'session.status', properties: { sessionID, status: { type } } }),
    snapshot,
    sessionSnapshot,
    pendingPrompts: (sessionID: string) => (queues.get(sessionID)?.items ?? []).filter(item => item.prompt || item.contextInput),
    enqueue,
    cancelScheduledTask,
    remove,
    take,
    takeAll,
    reorder,
    clear,
    release,
    processPayload,
    start,
    stop,
    flush: () => writePromise,
  };
}

