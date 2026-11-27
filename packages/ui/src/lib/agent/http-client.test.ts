import { test, expect } from 'bun:test';
import { createConversationHttpClient } from './http-client';
import { createAntigravityAdapter } from './antigravity';
import { createOpenCodeBackend } from '../opencode/backend';
import { opencodeClient } from '../opencode/client';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '../runtime-url';
import { useAuthSessionStore } from '../runtime-auth-expiry';
import { createStore } from 'zustand/vanilla';
import { resyncBlockingRequestsForDirectory } from '@/sync/blocking-request-recovery';
import { INITIAL_STATE } from '@/sync/types';
import type { DirectoryStore } from '@/sync/child-store';
import type { FormRequest } from './requests';
import { getAgentBackend } from './active';
import { bootstrapDirectory } from '@/sync/bootstrap';
import { resyncDirectorySessionStatuses } from '@/sync/session-status-recovery';

test('managed requests share directory-scoped transport and recover pending cards after replies', async () => {
  const previousFetch = globalThis.fetch;
  const previousResolver = getRuntimeUrlResolver();
  configureRuntimeUrlResolver({ apiBaseUrl: 'http://127.0.0.1:7878' });
  opencodeClient.reconnectToRuntimeBaseUrl();
  useAuthSessionStore.getState().markAuthenticated();
  const calls: Array<{ path: string; directory: string | null; method: string; body: unknown }> = [];
  const form: FormRequest = { id: 'frm_1', sessionID: 'ses_ag_native', title: 'Color', fields: [{ key: 'q0', type: 'string' }] };
  const permission = { id: 'per_oc_1', sessionID: 'ses_standard', action: 'edit', resources: ['file.txt'] };
  let settled = false;
  let failed = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, directory: url.searchParams.get('directory'), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    if (failed) return Response.json({ error: 'Unavailable' }, { status: 503 });
    if (url.pathname.startsWith('/api/conversation-requests/')) return Response.json(settled ? [] : url.pathname.endsWith('/forms') ? [form] : [permission]);
    return new Response(null, { status: 204 });
  };
  try {
    const standard = createConversationHttpClient('opencode', createOpenCodeBackend().runtime);
    const native = createAntigravityAdapter();
    expect(await standard.listPendingForms()).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await standard.listPendingForms({ directories: ['/repo/', '/repo'] })).toEqual([form]);
    expect(calls).toHaveLength(1);
    expect(await native.runtime.listPendingPermissions({ directories: ['/repo'] })).toEqual([permission]);
    expect(calls.every(call => call.directory === '/repo')).toBe(true);
    expect(await standard.replyToPermission(permission.sessionID, permission.id, 'reject', { directory: '/repo', message: 'Stop' })).toBe(true);
    expect(calls.at(-1)).toEqual({ path: '/api/conversations/ses_standard/permission/per_oc_1/reply', directory: '/repo', method: 'POST', body: { decision: 'reject', message: 'Stop' } });
    expect(await native.client.replyToForm(form.sessionID, form.id, { q0: 'Blue' }, '/repo')).toBe(true);
    expect(calls.at(-1)?.path).toBe('/api/conversations/ses_ag_native/form/frm_1/reply');
    expect(await native.client.cancelForm(form.sessionID, form.id, '/repo', 'Skip')).toBe(true);
    expect(calls.at(-1)?.body).toEqual({ message: 'Skip' });
    await native.client.stageRevert(form.sessionID, 'msg_edit', { directory: '/repo' });
    expect(calls.at(-1)).toEqual({ path: '/api/conversations/ses_ag_native/revert/stage', directory: '/repo', method: 'POST', body: { messageID: 'msg_edit' } });
    await native.client.clearRevert(form.sessionID, '/repo');
    expect(calls.at(-1)?.path).toBe('/api/conversations/ses_ag_native/revert/clear');
    await native.client.commitRevert(form.sessionID, '/repo');
    expect(calls.at(-1)?.path).toBe('/api/conversations/ses_ag_native/revert/commit');
    const store = createStore<DirectoryStore>()(set => ({ ...INITIAL_STATE, form: { [form.sessionID]: [form] }, permission: { [permission.sessionID]: [permission] }, patch: partial => set(partial), replace: next => set(next) }));
    expect(await resyncBlockingRequestsForDirectory('/repo', store)).toBe(true);
    expect(store.getState().form[form.sessionID]).toEqual([form]);
    expect(store.getState().permission[permission.sessionID]).toEqual([permission]);
    failed = true;
    expect(await resyncBlockingRequestsForDirectory('/repo', store)).toBe(false);
    expect(store.getState().form[form.sessionID]).toEqual([form]);
    expect(store.getState().permission[permission.sessionID]).toEqual([permission]);
    failed = false;
    settled = true;
    expect(await resyncBlockingRequestsForDirectory('/repo', store)).toBe(true);
    expect(store.getState().form[form.sessionID]).toBeUndefined();
    expect(store.getState().permission[permission.sessionID]).toBeUndefined();
  } finally {
    globalThis.fetch = previousFetch;
    setRuntimeUrlResolver(previousResolver);
    opencodeClient.reconnectToRuntimeBaseUrl();
  }
});

test('managed directory initialization and status recovery use the host runtime contract', async () => {
  const previousFetch = globalThis.fetch;
  const previousResolver = getRuntimeUrlResolver();
  configureRuntimeUrlResolver({ apiBaseUrl: 'http://127.0.0.1:7878' });
  opencodeClient.reconnectToRuntimeBaseUrl();
  useAuthSessionStore.getState().markAuthenticated();
  const calls: string[] = [];
  const statusDirectories: Array<string | null> = [];
  let failed = false;
  const session = (directory: string) => ({ id: `ses_${directory.slice(1)}`, projectID: directory, directory, title: directory, time: { created: 1, updated: 1 }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    const directory = url.searchParams.get('directory') ?? '/repo-a';
    calls.push(url.pathname);
    if (url.pathname === '/api/conversation-runtime/statuses') {
      statusDirectories.push(url.searchParams.get('directory'));
      return failed ? Response.json({ error: 'Unavailable' }, { status: 503 }) : Response.json({ 'ses_repo-a': { type: 'busy' }, 'ses_repo-b': { type: 'busy' } });
    }
    if (url.pathname === '/api/conversation-runtime/configuration') return Response.json({ defaultAgent: 'codex', defaultModel: 'codex/gpt' });
    if (url.pathname === '/api/conversation-runtime/location') return Response.json({ directory, project: { id: directory, directory, canonical: directory } });
    if (url.pathname === '/api/conversation-runtime/projects') return Response.json([]);
    if (url.pathname === '/api/conversation-runtime/vcs') return Response.json({ branch: 'main' });
    if (url.pathname.startsWith('/api/conversation-requests/')) return Response.json([]);
    if (url.pathname === '/api/conversations') return Response.json({ sessions: [session(directory)], cursor: {} });
    if (url.pathname === '/api/shell') return Response.json({ location: { directory }, data: [] });
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  try {
    const backend = getAgentBackend();
    for (const directory of ['/repo-a', '/repo-b']) {
      backend.runtime.setDirectory(directory);
      const store = createStore<DirectoryStore>()(set => ({ ...INITIAL_STATE, patch: partial => set(partial), replace: next => set(next) }));
      const bootstrap = bootstrapDirectory({ directory, store, set: patch => store.setState(patch), global: { config: {}, projects: [], path: { directory: '', worktree: '', home: '/home' } }, loadSessions: async folder => { store.setState({ session: await backend.client.listSessions(folder) }); } });
      expect(await bootstrap.sessions).toBe('complete');
      expect(await bootstrap.environment).toBe('complete');
      expect(store.getState().path.directory).toBe(directory);
      expect(store.getState().config).toEqual({ defaultAgent: 'codex', defaultModel: 'codex/gpt' });
      expect(store.getState().vcs).toEqual({ branch: 'main' });
      expect(store.getState().session_status).toEqual({ [session(directory).id]: { type: 'busy' } });
      failed = true;
      expect(await resyncDirectorySessionStatuses(directory, store, [session(directory).id], 'authoritative')).toBeNull();
      expect(store.getState().session_status).toEqual({ [session(directory).id]: { type: 'busy' } });
      failed = false;
      expect(await resyncDirectorySessionStatuses(directory, store, [session(directory).id], 'authoritative')).not.toBeNull();
    }
    expect(await backend.runtime.listProjects()).toEqual([]);
    backend.runtime.setDirectory('/spaces/123456789abc');
    await backend.runtime.getActiveSessionStatuses();
    expect(statusDirectories.at(-1)).toBeNull();
    await backend.runtime.getActiveSessionStatuses('/spaces/123456789abc');
    expect(statusDirectories.at(-1)).toBe('/spaces/123456789abc');
    expect(calls.filter(route => route === '/api/conversation-runtime/statuses')).toHaveLength(8);
    expect(calls.some(route => route.startsWith('/api/agent/antigravity/'))).toBe(false);
  } finally {
    getAgentBackend().runtime.setDirectory(undefined);
    globalThis.fetch = previousFetch;
    setRuntimeUrlResolver(previousResolver);
    opencodeClient.reconnectToRuntimeBaseUrl();
  }
});
