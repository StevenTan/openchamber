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
