import { useCallback, useContext, useState } from 'react';
import { toast } from '@/components/ui';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { PanelWorkspaceDirectoryContext } from '@/lib/workspace/panelOwner';
import { useConfigStore } from '@/stores/useConfigStore';
import { usePanelWorkspaceApi } from '@/stores/useUIStore';
import { createSideChat } from '@/lib/sideChats';
import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import { chatQuoteDraft } from '@/lib/chatQuoteDraft';
import { useInlineCommentDraftStore } from '@/stores/useInlineCommentDraftStore';
import { createChatDraftIdentity } from '@/lib/chatDraftPersistence';
import { useInputStore } from '@/sync/input-store';

export function useNewSideChat() {
  const workspace = usePanelWorkspaceApi();
  const hostDirectory = useContext(PanelWorkspaceDirectoryContext);
  const { sessionId: parentSessionId } = useChatSessionSelection();
  const effectiveDirectory = useEffectiveDirectory();
  const panelDirectory = hostDirectory ?? effectiveDirectory;
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const create = useCallback(async (quote?: { text: string; directory: string }) => {
    if (!panelDirectory || pending) return;
    const runtime = getRuntimeKey();
    const state = workspace.getState();
    const config = useConfigStore.getState();
    setPending(true);
    try {
      const session = await createSideChat(parentSessionId, quote?.directory ?? panelDirectory, {
        agent: config.currentAgentName,
        model: config.currentProviderId && config.currentModelId ? { providerID: config.currentProviderId, id: config.currentModelId } : undefined,
      }, runtime, t('contextPanel.chat.newTab'));
      if (getRuntimeKey() !== runtime) return;
      if (quote) {
        const attached = useInlineCommentDraftStore.getState().addDraft(
          { directory: session.directory ?? quote.directory, sessionKey: session.id },
          chatQuoteDraft(quote.text),
        );
        if (!attached) toast.error(t('inlineComment.toast.noRoom'));
      }
      const composer = createChatDraftIdentity(runtime, session.directory, session.id);
      if (composer) useInputStore.getState().requestComposerFocus(composer);
      state.openContextPanelTab(panelDirectory, {
        mode: 'chat', dedupeKey: `session:${session.id}`, targetDirectory: session.directory ?? quote?.directory ?? effectiveDirectory,
        sessionTitleFallback: t('sessions.sidebar.header.actions.newSession'),
        discardOnClose: true,
      });
    } catch (error) {
      if (getRuntimeKey() === runtime) toast.error(t('contextPanel.chat.createFailed'), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setPending(false);
    }
  }, [workspace, panelDirectory, parentSessionId, pending, effectiveDirectory, t]);
  return { create, pending };
}
