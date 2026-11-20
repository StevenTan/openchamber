import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { focusChatInput } from './composer/editor/dom';
import { DisplayedWorkspaceContext } from '@/lib/workspace/panelOwner';

export type ChatColumnSession = {
  sessionId: string | null;
  directory: string | null;
};

export const ChatColumnSessionContext = React.createContext<ChatColumnSession | null>(null);

export const useChatColumnSession = (): ChatColumnSession | null => React.useContext(ChatColumnSessionContext);

/**
 * The session a chat component acts on: its column's when it renders inside
 * one, the displayed workspace around it, or the app's selection outside a
 * workspace. A column never subscribes to the main selection, so a pinned
 * column does not re-render when the main chat switches sessions.
 */
export const useChatSessionSelection = (): ChatColumnSession => {
  const column = useChatColumnSession();
  const workspace = React.useContext(DisplayedWorkspaceContext);
  const selection = column ?? workspace;
  const liveSessionId = useSessionUIStore((state) => (selection ? null : state.currentSessionId));
  const liveDirectory = useSessionUIStore((state) => (selection ? null : state.currentSessionDirectory));
  const sessionId = selection ? selection.sessionId : liveSessionId;
  const directory = selection ? selection.directory : liveDirectory;
  return React.useMemo(
    () => ({ sessionId, directory }),
    [sessionId, directory],
  );
};

export const ChatTranscriptDirectoryContext = React.createContext<string | null>(null);

export const useChatTranscriptDirectory = (): string | null => {
  const nested = React.useContext(ChatTranscriptDirectoryContext);
  const { directory } = useChatSessionSelection();
  return nested ?? directory;
};

export type ChatColumnActions = {
  pinned: boolean;
  openSession: (sessionId: string, directory: string | null) => void;
  openTimelineDialog: () => void;
  focusInput: () => void;
};

const MAIN_COLUMN_ACTIONS: ChatColumnActions = {
  pinned: false,
  openSession: (sessionId, directory) => useSessionUIStore.getState().setCurrentSession(sessionId, directory),
  openTimelineDialog: () => useUIStore.getState().setTimelineDialogOpen(true),
  focusInput: focusChatInput,
};

export const ChatColumnActionsContext = React.createContext<ChatColumnActions>(MAIN_COLUMN_ACTIONS);

export const useChatColumnActions = (): ChatColumnActions => React.useContext(ChatColumnActionsContext);

type ChatColumnExpandedInput = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

const PINNED_COLUMN_EXPANDED_INPUT: ChatColumnExpandedInput = {
  expanded: false,
  setExpanded: () => {},
};

export const useChatColumnExpandedInput = (): ChatColumnExpandedInput => {
  const { pinned } = useChatColumnActions();
  const globalExpanded = useUIStore((state) => (pinned ? false : state.isExpandedInput));
  const setGlobalExpanded = useUIStore((state) => state.setExpandedInput);
  return React.useMemo(
    () => (pinned ? PINNED_COLUMN_EXPANDED_INPUT : { expanded: globalExpanded, setExpanded: setGlobalExpanded }),
    [pinned, globalExpanded, setGlobalExpanded],
  );
};
