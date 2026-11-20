import { useShallow } from 'zustand/react/shallow';

import { draftSpaceTarget, type DraftSpaceTarget } from './space-creation-requests';
import { useSpacesStore } from './spaces-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useContext } from 'react';
import { useChatColumnSession } from '@/components/chat/chatColumnSession';
import { PanelWorkspaceDraftRequestContext } from '@/lib/workspace/panelOwner';

export const useDraftSpaceTarget = (): DraftSpaceTarget | null => {
  const workspaceRequest = useContext(PanelWorkspaceDraftRequestContext);
  const column = useChatColumnSession();
  const requestId = useSessionUIStore((s) => column?.sessionId ? null : workspaceRequest !== undefined ? workspaceRequest : (s.currentSessionId === null && s.newSessionDraft?.open ? s.newSessionDraft.pendingWorktreeRequestId ?? null : null));
  return useSpacesStore(useShallow((s) => draftSpaceTarget(requestId, s.journey)));
};
