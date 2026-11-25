import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { antigravityRequest } from '@/lib/agent/antigravity';
import { reportSettingsSaveState } from '@/lib/persistence';
import type { AntigravityAuthentication } from '@openchamber/sdk/agent-backends';
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import { z } from 'zod';

const authenticationChanged = z.object({ type: z.literal('antigravity.authentication') });

export function useAntigravitySettings() {
  const [binary, setBinary] = useState('agy');
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [authentication, setAuthentication] = useState<AntigravityAuthentication>({ phase: 'idle' });
  const [code, setCode] = useState('');
  const authenticating = authentication.phase === 'starting' || authentication.phase === 'waiting' || authentication.phase === 'verifying';
  useEffect(() => {
    void antigravityRequest<{ binary: string; installed: boolean }>('/settings').then(settings => { setBinary(settings.binary); setInstalled(settings.installed); }, error => toast.error(String(error)));
    const refresh = () => { void antigravityRequest<AntigravityAuthentication>('/authentication').then(setAuthentication, error => setAuthentication({ phase: 'failed', message: String(error) })); };
    const unsubscribe = subscribeOpenchamberEvents(event => {
      if (event.type === 'event-stream-ready' || event.type === 'agent-backend' && event.payload.type === 'control' && authenticationChanged.safeParse(event.payload.payload).success) refresh();
    });
    refresh();
    return unsubscribe;
  }, []);
  const save = async () => {
    reportSettingsSaveState('saving');
    try { await antigravityRequest('/settings', 'PUT', { binary }); setInstalled((await antigravityRequest<{ installed: boolean }>('/settings')).installed); reportSettingsSaveState('saved'); return true; }
    catch (error) { reportSettingsSaveState('error'); toast.error(String(error)); return false; }
  };
  const authenticate = async (route: string, body?: { code: string }) => {
    setBusy(true);
    try { setAuthentication(await antigravityRequest<AntigravityAuthentication>(route, 'POST', body)); }
    catch (error) { setAuthentication({ phase: 'failed', message: String(error) }); }
    finally { setBusy(false); }
  };
  const login = async () => {
    if (!(await save())) return;
    setCode('');
    await authenticate('/authenticate');
  };
  const install = async () => {
    setBusy(true);
    try {
      await antigravityRequest('/install', 'POST');
      setInstalled((await antigravityRequest<{ installed: boolean }>('/settings')).installed);
    }
    catch (error) { toast.error(String(error)); }
    finally { setBusy(false); }
  };
  return {
    binary, setBinary, busy, save, login, installed, install, authentication, authenticating, code, setCode,
    submit: () => authenticate('/authentication/code', { code }),
    cancel: () => authenticate('/authentication/cancel'),
    logout: () => authenticate('/logout'),
  };
}
