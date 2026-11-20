import fs from 'fs';
import os from 'os';
import path from 'path';
import { OpenCode } from '@opencode/client';
import { readMergedSettingsSync } from '../settings/settings-files.js';
import { isString } from '../shared/guards.js';
import { sessionParentId } from '../session-lineage.js';
import { loadAssistContext, newestContentId } from './context.js';
import { buildAssistPrompt, buildAssistSystemPrompt } from './prompt.js';

const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber'),
  'settings.json',
);

const getSessionRecapEnabled = () => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  return settings.sessionRecapEnabled !== false;
};

const IDLE_QUIET_MS = 60_000;
const RECAP_CHAR_LIMIT = 320;
const FETCH_TIMEOUT_MS = 5_000;
const GENERATION_TIMEOUT_MS = 120_000;
const TAIL_RECHECK_LIMIT = 8;
const QUIET_FAILURE_CODES = new Set(['context-too-small', 'output-exhausted']);

const describeGenerationFailure = (error) => {
  const parts = [];
  const status = Number(error?.statusCode);
  if (Number.isFinite(status)) parts.push(`status ${status}`);
  const code = isString(error?.code) ? error.code.trim() : '';
  if (code) parts.push(`code ${code}`);
  const message = isString(error?.message) ? error.message.trim() : '';
  if (message) parts.push(message.replace(/\s+/g, ' ').slice(0, 300));
  const tag = isString(error?._tag) ? error._tag.trim() : '';
  if (tag) parts.push(`tag ${tag}`);
  return parts.join(' | ');
};

const extractJsonObject = (value) => {
  const text = String(value ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  for (let end = candidate.length; end > start; end -= 1) {
    if (candidate[end - 1] !== '}') continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // keep scanning — models wrap JSON in prose sometimes
    }
  }
  return null;
};

const extractSessionStatus = (payload) => {
  if (!payload || payload.type !== 'session.status') return null;
  const properties = payload.properties && typeof payload.properties === 'object' ? payload.properties : {};
  const status = properties.status && typeof properties.status === 'object' ? properties.status : {};
  const info = properties.info && typeof properties.info === 'object' ? properties.info : {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const type = typeof status.type === 'string'
    ? status.type.trim()
    : (typeof info.type === 'string' ? info.type.trim() : '');
  if (!sessionId || !type) return null;
  const directory = typeof properties.directory === 'string' && properties.directory
    ? properties.directory
    : (typeof info.directory === 'string' ? info.directory : '');
  return { sessionId, type, directory };
};

const extractUserMessage = (payload) => {
  if (!payload || payload.type !== 'message.updated') return null;
  const info = payload.properties?.info;
  if (!info || typeof info !== 'object' || info.role !== 'user') return null;
  if (typeof info.sessionID !== 'string' || !info.sessionID) return null;
  return {
    sessionId: info.sessionID,
    createdAt: typeof info.time?.created === 'number' ? info.time.created : 0,
  };
};

/**
 * The recap lives in OpenChamber's own session metadata
 * store: OpenCode 2.x accepts session metadata only when a session is created.
 * `persistSessionAssist(sessionID, directory, assist)` writes it; without that
 * seam the runtime stays inert rather than generating text it cannot save.
 */
export const createSessionAssistRuntime = ({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  getSmallModelService,
  getEnabled = getSessionRecapEnabled,
  quietMs = IDLE_QUIET_MS,
  persistSessionAssist = null,
  isSessionArchived = async () => false,
  // Asked once when a turn ends, before the recap's quiet window is armed.
  // A null result leaves the decision to the Small Model. See session-work.
  evaluateTurn = null,
  lineage = null,
  onPendingChange = () => {},
}) => {
  const timers = new Map();
  const gates = new Map();
  const inflight = new Map();
  const ready = new Map();
  const persisted = new Map();
  const announced = new Map();
  let stopped = false;

  const announce = (sessionId, directory = '') => {
    const pending = !stopped && (gates.has(sessionId) || timers.has(sessionId)
      || inflight.has(sessionId) || ready.has(sessionId));
    if (pending === announced.has(sessionId)) return;
    const announcedDirectory = pending ? directory : announced.get(sessionId);
    if (pending) announced.set(sessionId, directory);
    else announced.delete(sessionId);
    onPendingChange({ sessionId, directory: announcedDirectory, pending });
  };

  const clearTimer = (sessionId) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing.timer);
      timers.delete(sessionId);
    }
  };

  const invalidate = (sessionId) => {
    clearTimer(sessionId);
    gates.delete(sessionId);
    ready.delete(sessionId);
    inflight.get(sessionId)?.controller.abort();
    announce(sessionId);
  };

  // A new turn retires the stored recap for the preceding turn.
  const retireStored = (sessionId, directory) => {
    if (!persisted.has(sessionId)) return;
    const storedDirectory = persisted.get(sessionId);
    persisted.delete(sessionId);
    Promise.resolve(persistSessionAssist(sessionId, directory || storedDirectory, null))
      .catch(() => console.warn('[session-assist] failed to retire a stale assist'));
  };

  const localSkipNotices = new Set();
  const reportLocalSkip = (providerID, modelID) => {
    const key = `${providerID}/${modelID}`;
    if (localSkipNotices.has(key)) return;
    localSkipNotices.add(key);
    console.log(`[session-assist] skipped: ${key} is served from a local endpoint and is the session's own model, so a side request would evict its prompt cache. Set a different Small Model to get a recap`);
  };

  const generateAssist = async (sessionId, directory, signal) => {
    if (!getEnabled()) return;
    const baseUrl = buildOpenCodeUrl('/', '').replace(/\/$/, '');
    const client = OpenCode.make({
      baseUrl,
      headers: {
        ...getOpenCodeAuthHeaders(),
        // external: #3837 v2 scopes sessions by the x-opencode-directory header and rejects non-ASCII header values.
        ...(directory ? { 'x-opencode-directory': encodeURIComponent(directory) } : {}),
      },
    });
    const requestOptions = () => ({ signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) });
    const checkCurrent = () => {
      signal.throwIfAborted();
      if (buildOpenCodeUrl('/', '').replace(/\/$/, '') !== baseUrl) throw new Error('Session assist runtime changed');
    };
    const session = await client.session.get({ sessionID: sessionId }, requestOptions());
    checkCurrent();
    if (session?.id === sessionId) lineage?.remember(sessionId, sessionParentId(session));
    if (session?.id !== sessionId || sessionParentId(session) || session.revert?.messageID) return;
    if (await isSessionArchived(sessionId)) return;
    const context = await loadAssistContext({
      signal,
      readPage: ({ limit, cursor }) => client.message.list(
        { sessionID: sessionId, limit, ...(cursor ? { cursor } : { order: 'desc' }) },
        requestOptions(),
      ),
    });
    checkCurrent();
    if (!context) return;
    const { last, turns } = context;
    const { describeSmallModel, generateSmallModelText } = await getSmallModelService();
    const preferredProviderID = last.providerID;
    const preferredModelID = last.modelID;
    const described = await describeSmallModel({ directory, preferredProviderID, preferredModelID });
    checkCurrent();
    if (!described) return;
    if (described.localEndpoint
      && described.providerID === preferredProviderID
      && described.modelID === preferredModelID) {
      reportLocalSkip(preferredProviderID, preferredModelID);
      return;
    }
    const system = buildAssistSystemPrompt();
    const prompt = buildAssistPrompt(turns, described.inputCharBudget - system.length - 512);
    if (!prompt) return;
    let generated;
    try {
      generated = await generateSmallModelText({
        prompt: prompt.text, system, directory,
        preferredProviderID, preferredModelID,
        onOverflow: 'error', timeoutMs: GENERATION_TIMEOUT_MS, signal,
      });
    } catch (error) {
      if (!signal.aborted && Number(error?.statusCode) !== 404 && !QUIET_FAILURE_CODES.has(error?.code)) {
        console.warn('[session-assist] generation failed', describeGenerationFailure(error));
      }
      return;
    }
    checkCurrent();
    const structured = extractJsonObject(generated?.text);
    let recap = typeof structured?.recap === 'string' ? structured.recap.trim().slice(0, RECAP_CHAR_LIMIT) : '';
    const hasCyrillic = (text) => /[\u0400-\u04FF]/.test(text);
    const hasCjk = (text) => /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(text);
    const scriptMismatch = (text) => prompt.language && ((hasCyrillic(text) && !hasCyrillic(prompt.language))
      || (hasCjk(text) && !hasCjk(prompt.language)));
    if (recap && scriptMismatch(recap)) recap = '';
    if (!recap) return;
    // v2 lists newest first. The answer is followed by its `idle` marker and
    // possibly a model or agent switch, so read a short tail and compare the
    // newest content record rather than the newest record.
    const latestPage = await client.message.list({ sessionID: sessionId, limit: TAIL_RECHECK_LIMIT, order: 'desc' }, requestOptions());
    checkCurrent();
    if (newestContentId(latestPage?.data) !== last.id) return;
    const freshSession = await client.session.get({ sessionID: sessionId }, requestOptions());
    checkCurrent();
    if (freshSession?.id !== sessionId || freshSession.revert?.messageID || freshSession.location?.directory !== session.location?.directory) return;
    if (await isSessionArchived(sessionId)) return;
    checkCurrent();
    if (!getEnabled()) return;
    await persistSessionAssist(sessionId, directory, {
      recap,
      forMessageID: last.id,
      generatedAt: Date.now(),
    });
    persisted.set(sessionId, directory);
  };

  const startGeneration = (sessionId, directory, armedAt) => {
    if (stopped) return;
    if (inflight.has(sessionId)) {
      ready.set(sessionId, { directory, armedAt });
      return;
    }
    const controller = new AbortController();
    inflight.set(sessionId, { controller, armedAt });
    generateAssist(sessionId, directory, controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) console.warn('[session-assist] failed to read or save assistance');
      })
      .finally(() => {
        inflight.delete(sessionId);
        if (ready.has(sessionId)) {
          const next = ready.get(sessionId);
          ready.delete(sessionId);
          startGeneration(sessionId, next.directory, next.armedAt);
        }
        announce(sessionId);
      });
  };

  const armTimer = (sessionId, directory, armedAt) => {
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      startGeneration(sessionId, directory, armedAt);
      announce(sessionId);
    }, quietMs);
    timer.unref?.();
    timers.set(sessionId, { timer, armedAt });
    announce(sessionId, directory);
  };

  // Only turns eligible for a recap arm the quiet window.
  const onTurnEnd = (sessionId, directory) => {
    clearTimer(sessionId);
    const armedAt = Date.now();
    if (!getEnabled()) {
      gates.delete(sessionId);
      announce(sessionId);
      return;
    }
    if (typeof evaluateTurn !== 'function') {
      armTimer(sessionId, directory, armedAt);
      return;
    }
    const gate = { armedAt };
    gates.set(sessionId, gate);
    announce(sessionId, directory);
    Promise.resolve()
      .then(() => evaluateTurn({ sessionId, directory, assist: { recap: true, suggestion: false } }))
      .catch(() => null)
      .then((allowed) => {
        if (stopped || gates.get(sessionId) !== gate) return;
        gates.delete(sessionId);
        if (allowed?.recap !== false) armTimer(sessionId, directory, armedAt);
        announce(sessionId);
      });
  };

  let parkedNoticeLogged = false;
  const processPayload = (payload, directoryHint = '') => {
    if (stopped) return;
    if (typeof persistSessionAssist !== 'function') {
      if (!parkedNoticeLogged) {
        parkedNoticeLogged = true;
        console.log('[session-assist] parked: no session metadata store is wired, so a recap could not be saved');
      }
      return;
    }
    const status = extractSessionStatus(payload);
    if (status) {
      if (status.type === 'idle') {
        if (lineage?.isChild(status.sessionId) !== true) onTurnEnd(status.sessionId, status.directory || directoryHint);
      }
      else {
        invalidate(status.sessionId);
        retireStored(status.sessionId, status.directory || directoryHint);
      }
      return;
    }
    const userMessage = extractUserMessage(payload);
    if (userMessage) {
      const since = timers.get(userMessage.sessionId)?.armedAt
        ?? gates.get(userMessage.sessionId)?.armedAt
        ?? inflight.get(userMessage.sessionId)?.armedAt;
      if (since !== undefined && userMessage.createdAt >= since) invalidate(userMessage.sessionId);
    }
  };

  const stop = () => {
    stopped = true;
    for (const sessionId of timers.keys()) clearTimer(sessionId);
    gates.clear();
    ready.clear();
    for (const { controller } of inflight.values()) controller.abort();
  };
  return { processPayload, stop };
};
