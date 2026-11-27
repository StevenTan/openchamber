import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { createWebAPIs } from '../../../../../../web/src/api/index';
import { ChatColumnSessionContext } from '../../chatColumnSession';
import { ChildStoreManager } from '@/sync/child-store';
import { SessionMessageLoader } from '@/sync/session-message-loader';
import { SyncRuntimeContext } from '@/sync/sync-runtime-context';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { conversationClient } from '@/lib/agent/active';
import { useComposerSelection } from './useComposerSelection';

const originalSessionUI = useSessionUIStore.getState();
const originalConfig = useConfigStore.getState();
const originalSelections = useSelectionStore.getState();

afterEach(() => {
  useSessionUIStore.setState(originalSessionUI, true);
  useConfigStore.setState(originalConfig, true);
  useSelectionStore.setState(originalSelections, true);
});

test('Antigravity BTW sends the model and effort shown by its native controls', async () => {
  const dom = new Window({ url: 'http://127.0.0.1:7878' });
  const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const childStores = new ChildStoreManager();
  const runtimeKey = getRuntimeKey();
  const runtime = {
    childStores,
    messageLoader: new SessionMessageLoader(childStores, { sdk: conversationClient, runtimeKey }),
    runtimeKey,
    currentDirectory: { get: () => '/repo', subscribe: () => () => {} },
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ providers: [], models: [] });
  childStores.ensureChild('/repo', { bootstrap: false }).setState({ session: [{
    id: 'ses_ag_parent', backendID: 'antigravity', projectID: 'project', directory: '/repo', title: 'Parent',
    agent: 'antigravity', model: { providerID: 'antigravity', id: 'gemini-hydrogen', variant: 'high' },
    time: { created: 1, updated: 1 }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }] });
  useConfigStore.setState({
    currentProviderId: 'openai', currentModelId: 'gpt', currentAgentName: 'build', currentVariant: 'low',
    agents: [{ id: 'build', name: 'build', displayName: 'Build', mode: 'primary', hidden: false, request: { settings: {}, headers: {}, body: {} }, permissions: [] }],
  });
  const key = 'ses_ag_parent';
  useSelectionStore.getState().saveSessionModelSelection(key, 'antigravity', 'gemini-hydrogen');
  useSelectionStore.getState().saveAgentModelVariantForSession(key, 'antigravity', 'antigravity', 'gemini-hydrogen', 'high');
  const Probe = () => {
    const selection = useComposerSelection({
      column: { columnPinned: false },
      editorState: { composerFormRef: React.useRef<HTMLFormElement>(null) },
      sessionScope: {
        currentSessionId: key, currentDirectory: '/repo', isBtwActive: true,
        btwComposerSessionId: 'btw:parent', sessionAgentPick: null,
        btwAgentSelection: 'build', btwModelSelection: { providerId: 'openai', modelId: 'gpt' },
      },
    });
    return <output>{JSON.stringify(selection.effectiveBtwSelection)}</output>;
  };
  try {
    await act(async () => root.render(<RuntimeAPIContext.Provider value={createWebAPIs()}>
      <SyncRuntimeContext.Provider value={runtime}>
        <ChatColumnSessionContext.Provider value={{ sessionId: key, directory: '/repo' }}><Probe /></ChatColumnSessionContext.Provider>
      </SyncRuntimeContext.Provider>
    </RuntimeAPIContext.Provider>));
    expect(JSON.parse(container.textContent ?? 'null')).toEqual({
      agent: 'antigravity', model: { providerId: 'antigravity', modelId: 'gemini-hydrogen' }, variant: 'high',
    });
  } finally {
    act(() => root.unmount());
    runtime.messageLoader.dispose();
    childStores.disposeAll();
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
