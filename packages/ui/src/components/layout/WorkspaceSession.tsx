import React from 'react';
import { useShownSessionSelection } from '@/components/chat/useShownSessionSelection';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import {
  DisplayedWorkspaceContext,
  PanelWorkspaceDirectoryContext,
  PanelWorkspaceDraftRequestContext,
  PanelWorkspaceOwnerContext,
} from '@/lib/workspace/panelOwner';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionRenderable } from '@/sync/sync-context';

/** The displayed session and its panels share one deferred commit. */
export const WorkspaceSession: React.FC<React.PropsWithChildren> = ({ children }) => {
  const sessionId = useSessionUIStore((state) => state.currentSessionId);
  const directory = useSessionUIStore((state) => state.currentSessionDirectory);
  const draft = useSessionUIStore((state) => state.newSessionDraft);
  const materializedSessionId = useSessionUIStore((state) => state.materializedDraftSessionId);
  const owner = useUIStore((state) => state.panelWorkspaceOwnerId);
  const panelDirectory = useEffectiveDirectory() ?? '';
  const target = React.useMemo(() => ({ sessionId, directory, draft, owner, panelDirectory }), [sessionId, directory, draft, owner, panelDirectory]);
  const renderable = useSessionRenderable(sessionId ?? '', directory ?? undefined);
  const { selection, revealWaited } = useShownSessionSelection(target, { renderable, materializedSessionId, newSessionDraftOpen: draft.open });
  const displayed = React.useMemo(() => ({ ...selection, revealWaited }), [selection, revealWaited]);
  const draftRequestId = selection.sessionId === null && selection.draft.open
    ? selection.draft.pendingWorktreeRequestId ?? null : null;
  return (
    <DisplayedWorkspaceContext.Provider value={displayed}>
      <PanelWorkspaceOwnerContext.Provider value={selection.owner}>
        <PanelWorkspaceDirectoryContext.Provider value={selection.panelDirectory}>
          <PanelWorkspaceDraftRequestContext.Provider value={draftRequestId}>
            {children}
          </PanelWorkspaceDraftRequestContext.Provider>
        </PanelWorkspaceDirectoryContext.Provider>
      </PanelWorkspaceOwnerContext.Provider>
    </DisplayedWorkspaceContext.Provider>
  );
};
