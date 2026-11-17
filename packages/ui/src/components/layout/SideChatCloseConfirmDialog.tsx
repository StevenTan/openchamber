import { useEffect, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { getSideChatCloseConfirmation, settleSideChatCloseConfirmation, subscribeSideChatCloseConfirmation } from './sideChatCloseConfirmation';

export function SideChatCloseConfirmDialog() {
  const { t } = useI18n();
  const request = useSyncExternalStore(subscribeSideChatCloseConfirmation, getSideChatCloseConfirmation, getSideChatCloseConfirmation);
  useEffect(() => {
    const unsubscribe = subscribeRuntimeEndpointChanged(() => settleSideChatCloseConfirmation(false));
    return () => {
      unsubscribe();
      settleSideChatCloseConfirmation(false);
    };
  }, []);
  const sessions = request?.sessions ?? [];
  const single = sessions.length === 1;
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) settleSideChatCloseConfirmation(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(single ? 'sessions.sidebar.dialogs.deleteSession.title' : 'sessions.sidebar.dialogs.deleteSessions.title')}</DialogTitle>
          <DialogDescription>
            {single
              ? t('sessions.sidebar.dialogs.deleteSession.single', { sessionTitle: sessions[0].title || t('sessions.sidebar.session.untitled') })
              : t('sessions.sidebar.dialogs.deleteSessions.pluralDescription', { count: sessions.length })}
          </DialogDescription>
        </DialogHeader>
        {!single && <ul className="max-h-48 overflow-y-auto typography-ui-label">
          {sessions.map((session) => <li key={session.id} className="truncate">{session.title || t('sessions.sidebar.session.untitled')}</li>)}
        </ul>}
        <DialogFooter>
          <Button variant="outline" autoFocus onClick={() => settleSideChatCloseConfirmation(false)}>{t('dialog.common.actions.cancel')}</Button>
          <Button variant="destructive" onClick={() => settleSideChatCloseConfirmation(true)}>{t(single ? 'sessions.sidebar.dialogs.deleteSession.titleAction' : 'sessions.sidebar.dialogs.deleteSessions.titleAction')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
