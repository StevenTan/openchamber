import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { createWebAPIs } from '../../../../web/src/api/index';
import { ChatColumnActionsContext, ChatColumnSessionContext } from '@/components/chat/chatColumnSession';
import { ChildStoreManager } from '@/sync/child-store';
import { SessionMessageLoader } from '@/sync/session-message-loader';
import { SyncRuntimeContext } from '@/sync/sync-runtime-context';
import { setSyncRefs } from '@/sync/sync-refs';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { conversationClient } from '@/lib/agent/active';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '@/lib/runtime-url';
import { useAuthSessionStore } from '@/lib/runtime-auth-expiry';
import { getSideChat } from '@/lib/sessionSideChatMetadata';
import type { Message, Session } from '@/lib/agent/model';
import { useNewSideChat } from './useNewSideChat';
import { I18nProvider } from '@/lib/i18n';
import { PanelWorkspaceDirectoryContext } from '@/lib/workspace/panelOwner';
import { toast } from '@/components/ui';
import { opencodeClient } from '@/lib/opencode/client';
import { z } from 'zod';

const requestBody = z.record(z.string(), z.json());

for (const backendID of ['opencode', 'antigravity']) {
  for (const [history, pinned] of [['first-prompt', false], ['completed-answer', false], ['empty', false], ['completed-answer', true]] as const) {
    test(`${backendID} side chat inherits ${history} history and the ${pinned ? 'pinned' : 'main'} composer selection`, async () => {
      const dom = new Window({ url: 'http://127.0.0.1:7878' });
      const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
      const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
      for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
      const previousResolver = getRuntimeUrlResolver();
      configureRuntimeUrlResolver({ apiBaseUrl: 'http://127.0.0.1:7878' });
      opencodeClient.reconnectToRuntimeBaseUrl();
      useAuthSessionStore.getState().markAuthenticated();
      const originalFetch = globalThis.fetch;
      const originalConfig = useConfigStore.getState();
      const originalSelections = useSelectionStore.getState();
      const originalSessions = useSessionUIStore.getState();
      const originalGlobal = useGlobalSessionsStore.getState();
      const childStores = new ChildStoreManager();
      const runtimeKey = getRuntimeKey();
      const runtime = {
        childStores,
        messageLoader: new SessionMessageLoader(childStores, { sdk: conversationClient, runtimeKey }),
        runtimeKey,
        currentDirectory: { get: () => '/repo', subscribe: () => () => {} },
      };
      setSyncRefs(childStores, '/repo');
      const id = backendID === 'antigravity' ? 'ses_ag_parent' : 'ses_parent';
      const forkID = backendID === 'antigravity' ? 'ses_ag_side' : 'ses_side';
      const providerID = backendID === 'antigravity' ? 'antigravity' : 'openai';
      const parent: Session = {
        id, backendID, projectID: 'project', directory: '/repo', title: 'Parent', agent: backendID,
        model: { providerID, id: 'old-model', variant: 'low' },
        time: { created: 1, updated: 1 }, cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      };
      const fork: Session = { ...parent, id: forkID };
      const latest: Message = { id: 'msg_latest_prompt', role: 'user', sessionID: forkID, time: { created: 3 } };
      const records = history === 'empty' ? [] : [{ info: latest, parts: [] }];
      const calls: Array<{ path: string; body: z.infer<typeof requestBody> }> = [];
      globalThis.fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(new URL(String(input), 'http://127.0.0.1:7878'), init);
        const path = new URL(request.url).pathname;
        const body = request.method === 'GET' ? {} : requestBody.parse(await request.json());
        calls.push({ path, body });
        if (path === `/api/conversations/${id}/fork`) return Response.json(fork);
        if (path === `/api/conversations/${forkID}/message`) return Response.json({ items: records, cursor: {} });
        if (path === `/api/conversations/${id}/message`) {
          const info = history === 'completed-answer'
            ? { id: 'msg_answer', role: 'assistant', sessionID: id, time: { created: 2, completed: 2 }, finish: 'stop', agent: backendID, providerID, modelID: 'old-model' }
            : { ...latest, sessionID: id };
          return Response.json({ items: history === 'empty' ? [] : [{ info, parts: [] }], cursor: {} });
        }
        if (path.endsWith('/model') && request.method === 'POST') { fork.model = { providerID, id: String(body.id), variant: String(body.variant) }; return new Response(null, { status: 204 }); }
        if (path.endsWith('/agent') && request.method === 'POST') { fork.agent = String(body.agent); return new Response(null, { status: 204 }); }
        if (path === '/api/conversation-catalog/agents') return Response.json([]);
        if (path === `/api/conversations/${forkID}`) {
          if (request.method === 'PATCH') fork.title = String(body.title);
          return Response.json(fork);
        }
        if (path === `/api/conversations/${id}`) return Response.json(parent);
        if (path.endsWith('/metadata')) {
          const target = path.includes(forkID) ? fork : parent;
          target.metadata = { ...target.metadata, ...requestBody.parse(body.patch) };
          return Response.json({ metadata: target.metadata });
        }
        return Response.json({ error: `Unexpected request: ${path}` }, { status: 404 });
      };
      childStores.ensureChild('/repo', { bootstrap: false }).setState({ session: [parent] });
      useConfigStore.setState({ isConnected: true, currentProviderId: providerID, currentModelId: pinned || backendID === 'antigravity' ? 'global-model' : 'picked-model', currentAgentName: backendID, currentVariant: 'high' });
      useSelectionStore.getState().saveSessionModelSelection(id, providerID, 'picked-model');
      useSelectionStore.getState().saveSessionAgentSelection(id, backendID);
      useSelectionStore.getState().saveAgentModelVariantForSession(id, backendID, providerID, 'picked-model', 'high');
      useSessionUIStore.setState({ currentSessionId: id, currentSessionDirectory: '/repo' });
      let create: ReturnType<typeof useNewSideChat>['create'] | undefined;
      const Probe = () => { create = useNewSideChat().create; return null; };
      const container = document.createElement('div');
      const root = createRoot(container);
      try {
        await act(async () => root.render(<I18nProvider><RuntimeAPIContext.Provider value={createWebAPIs()}>
          <SyncRuntimeContext.Provider value={runtime}>
            <PanelWorkspaceDirectoryContext.Provider value="/repo"><ChatColumnSessionContext.Provider value={{ sessionId: id, directory: '/repo' }}>
              <ChatColumnActionsContext.Provider value={{ pinned, openSession: () => {}, openTimelineDialog: () => {}, focusInput: () => {} }}><Probe /></ChatColumnActionsContext.Provider>
            </ChatColumnSessionContext.Provider></PanelWorkspaceDirectoryContext.Provider>
          </SyncRuntimeContext.Provider>
        </RuntimeAPIContext.Provider></I18nProvider>));
        await act(async () => { await create?.(); });
        expect(toast.getHistory().flatMap(item => 'type' in item && item.type === 'error' ? [item.description] : [])).toEqual([]);
        expect(calls).not.toEqual([]);
        expect(calls.find(call => call.path === `/api/conversations/${id}/fork`)?.body).toEqual({});
        expect(getSideChat(fork)).toEqual({ temporary: true, parentSessionID: id, boundary: history === 'empty' ? null : { id: latest.id, created: 3, synthetic: false } });
        expect(fork.model).toEqual({ providerID, id: 'picked-model', variant: 'high' });
        expect(parent.model?.id).toBe('old-model');
        expect(useSelectionStore.getState().getSessionModelSelection(forkID)).toEqual({ providerId: providerID, modelId: 'picked-model' });
      } finally {
        act(() => root.unmount());
        runtime.messageLoader.dispose();
        childStores.disposeAll();
        globalThis.fetch = originalFetch;
        setRuntimeUrlResolver(previousResolver);
        opencodeClient.reconnectToRuntimeBaseUrl();
        useConfigStore.setState(originalConfig, true);
        useSelectionStore.setState(originalSelections, true);
        useSessionUIStore.setState(originalSessions, true);
        useGlobalSessionsStore.setState(originalGlobal, true);
        for (const [name, descriptor] of originals) {
          if (descriptor) Object.defineProperty(globalThis, name, descriptor);
          else Reflect.deleteProperty(globalThis, name);
        }
      }
    });
  }
}
