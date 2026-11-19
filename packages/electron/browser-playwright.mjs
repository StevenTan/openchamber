import { chromium, createPlaywrightTools } from '@openchamber/web/server/lib/browser-control/playwright.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBrowserAgentCursor } from './browser-agent-cursor.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';

const cursorRequest = new AsyncLocalStorage();

/** Connects Playwright to one panel webview through Electron's page debugger. */
async function connectPanelPage(target, cursor, requests) {
  if (!target.debugger.isAttached()) target.debugger.attach('1.3');
  const { targetInfo } = await target.debugger.sendCommand('Target.getTargetInfo');
  const sessions = new Set();
  let closed = false;
  let active = 0;
  const fileChooserSessions = new Set();
  let dragSession;
  let interceptDrags = false;
  let inputQueue = Promise.resolve();
  const receive = (_event, method, params, sessionId) => {
    if (method === 'Input.dragIntercepted' && !sessionId) sessionId = dragSession;
    if (method === 'Target.attachedToTarget' && !sessionId) {
      sessions.add(params.sessionId);
      params = { ...params, targetInfo: { ...params.targetInfo, type: params.targetInfo.type === 'webview' ? 'page' : params.targetInfo.type } };
    }
    if (method === 'Target.detachedFromTarget') {
      sessions.delete(params.sessionId);
      fileChooserSessions.delete(params.sessionId);
    }
    transport.onmessage?.({ method, params, sessionId });
  };
  const disconnected = () => {
    closed = true;
    cursor.cancel(target);
    target.debugger.removeListener('message', receive);
    target.debugger.removeListener('detach', disconnected);
    target.removeListener('destroyed', disconnected);
    transport.onclose?.();
  };
  const transport = {
    send({ id, method, params = {}, sessionId }) {
      const cursorContext = cursorRequest.getStore();
      const requestId = cursorContext?.requestId;
      const run = async () => {
        if (closed) throw new Error('Browser connection closed');
        if (method.startsWith('Input.') && requestId && !requests.has(requestId)) throw new Error('Browser action finished');
        if (!sessionId && method === 'Target.setAutoAttach') {
          if (params.autoAttach) await target.debugger.sendCommand('Target.attachToTarget', { targetId: targetInfo.targetId, flatten: true });
          return {};
        }
        // Electron's native text insertion targets this webview's focused frame.
        if (method === 'Input.insertText') {
          await target.insertText(params.text);
          return {};
        }
        if (method === 'Page.setInterceptFileChooserDialog') {
          if (params.enabled) fileChooserSessions.add(sessionId);
          else fileChooserSessions.delete(sessionId);
          params = { ...params, enabled: active > 0 && params.enabled };
        }
        if (method === 'Input.setInterceptDrags') {
          dragSession = sessionId;
          interceptDrags = params.enabled;
        }
        if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseMoved') {
          await cursor.move(target, params, requestId, cursorContext.visible);
          if (closed) throw new Error('Browser connection closed');
          if (!requests.has(requestId)) throw new Error('Browser action finished');
        }
        const result = await target.debugger.sendCommand(method, params, method.startsWith('Input.') ? undefined : sessionId);
        if (result.targetInfo?.type === 'webview') result.targetInfo.type = 'page';
        return result;
      };
      const task = method.startsWith('Input.') ? inputQueue.then(run) : run();
      if (method.startsWith('Input.')) inputQueue = task.catch(() => {});
      task.then(
        result => transport.onmessage?.({ id, result, sessionId }),
        error => transport.onmessage?.({ id, error: { code: -32000, message: error.message }, sessionId }),
      );
    },
    async close() {
      if (closed) return;
      disconnected();
      if (interceptDrags) await target.debugger.sendCommand('Input.setInterceptDrags', { enabled: false });
      for (const sessionId of fileChooserSessions) await target.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false }, sessionId);
      for (const sessionId of sessions) await target.debugger.sendCommand('Target.detachFromTarget', { sessionId });
    },
  };
  target.debugger.on('message', receive);
  target.debugger.once('detach', disconnected);
  target.once('destroyed', disconnected);
  try {
    const browser = await chromium.connectOverCDP(transport, { noDefaults: true, timeout: 10_000 });
    return {
      browser, page: browser.contexts()[0].pages()[0], disconnect: () => transport.close(),
      async setActive(enabled) {
        active += enabled ? 1 : -1;
        if (!closed) for (const sessionId of fileChooserSessions) await target.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: active > 0 }, sessionId);
      },
    };
  } catch (error) {
    await transport.close();
    throw error;
  }
}

export function createPanelPlaywright() {
  const cursor = createBrowserAgentCursor();
  const pages = new WeakMap();
  const requests = new Map();
  const run = async (target, input, requestId, workspaceDir, cursorVisible = true) => {
    const controller = new AbortController();
    requests.set(requestId, controller);
    try {
      let pending = pages.get(target);
      if (!pending) {
        pending = (async () => {
          const connection = await connectPanelPage(target, cursor, requests);
          const { browser, page } = connection;
          const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-browser-'));
          let tools;
          browser.once('disconnected', () => {
            pages.delete(target);
            void tools?.close().catch(error => console.warn('[browser-playwright] closing MCP:', error));
            void fs.rm(outputDir, { recursive: true, force: true }).catch(error => console.warn('[browser-playwright] clearing output:', error));
          });
          try {
            tools = await createPlaywrightTools(async () => page.context(), { workspaceDir: workspaceDir ?? outputDir, outputDir });
            await tools.initialize();
            return { ...connection, tools, workspaceDir };
          } catch (error) {
            await browser.close();
            throw error;
          }
        })();
        pages.set(target, pending);
        pending.catch(() => { pages.delete(target); });
      }
      const connection = await pending;
      const { tools } = connection;
      const fileOperation = input.arguments?.filename !== undefined
        || ((input.tool === 'browser_file_upload' || input.tool === 'browser_drop') && !!input.arguments?.paths?.length);
      if (fileOperation && (!workspaceDir || connection.workspaceDir !== workspaceDir)) {
        throw new Error('Browser file operations require a local workspace.');
      }
      const cancel = () => { void connection.disconnect().catch(error => console.warn('[browser-playwright] cancelling action:', error)); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      if (controller.signal.aborted) cancel();
      controller.signal.throwIfAborted();
      await target.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
      await connection.setActive(true);
      try {
        return await cursorRequest.run({ requestId, visible: cursorVisible }, () => tools.call(input, { signal: controller.signal }));
      } finally {
        requests.delete(requestId);
        cursor.releaseRequest(requestId);
        controller.signal.removeEventListener('abort', cancel);
        await connection.setActive(false);
      }
    } finally {
      requests.delete(requestId);
      cursor.releaseRequest(requestId);
    }
  };
  return { run, cancel(requestId) { requests.get(requestId)?.abort(); }, cursorArrived: cursor.arrive };
}
