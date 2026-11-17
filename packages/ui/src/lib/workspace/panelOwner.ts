import { createContext } from 'react';
import { getRuntimeKey } from '@/lib/runtime-switch';
import type { NewSessionDraftState } from '@/sync/session-ui-store';

export const PanelWorkspaceOwnerContext = createContext<string | null>(null);
export const PanelWorkspaceDirectoryContext = createContext<string | null>(null);
export const PanelWorkspaceActiveContext = createContext(true);
export const PanelWorkspaceDraftRequestContext = createContext<string | null | undefined>(undefined);
type DisplayedWorkspace = {
  sessionId: string | null;
  directory: string | null;
  draft: NewSessionDraftState;
  revealWaited: boolean;
};
export const DisplayedWorkspaceContext = createContext<DisplayedWorkspace | null>(null);

export const sessionPanelOwner = (sessionId: string, runtimeKey = getRuntimeKey()): string =>
  JSON.stringify([runtimeKey, 'session', sessionId]);

export const draftPanelOwner = (draft: NewSessionDraftState, runtimeKey = getRuntimeKey()): string =>
  JSON.stringify([runtimeKey, 'draft', draft.workDraftId ?? draft.draftId]);

let readOwner = () => JSON.stringify([getRuntimeKey(), 'initializing']);
const listeners = new Set<() => void>();

export const bindPanelOwnerSelection = (read: () => string, subscribe: (changed: () => void) => () => void): void => {
  readOwner = read;
  subscribe(() => { for (const changed of listeners) changed(); });
  for (const changed of listeners) changed();
};

export const getPanelWorkspaceOwner = (): string => readOwner();
export const subscribePanelWorkspaceOwner = (changed: () => void): (() => void) => {
  listeners.add(changed);
  return () => { listeners.delete(changed); };
};
