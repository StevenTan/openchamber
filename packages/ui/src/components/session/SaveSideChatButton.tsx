import { useState } from 'react';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { isTemporarySideChat } from '@/lib/sessionSideChatMetadata';
import { saveSideChat } from '@/lib/sideChats';
import { useSessionSelector } from '@/sync/sync-context';

export function SaveSideChatButton({ sessionID, directory }: { sessionID: string; directory: string }) {
  const temporary = useSessionSelector(sessionID, directory, isTemporarySideChat);
  const [pending, setPending] = useState(false);
  const { t } = useI18n();
  if (!temporary) return null;
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={pending}
        aria-label={t('contextPanel.chat.save')} onClick={async () => {
          setPending(true);
          try {
            await saveSideChat(sessionID, directory);
          } catch (error) {
            toast.error(t('contextPanel.chat.saveFailed'), { description: error instanceof Error ? error.message : String(error) });
          } finally {
            setPending(false);
          }
        }}>
        <Icon name="save-3" className="h-3.5 w-3.5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom" sideOffset={6}>{t('contextPanel.chat.save')}</TooltipContent>
  </Tooltip>;
}
