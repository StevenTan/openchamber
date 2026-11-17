import { create } from 'zustand';

type MountedPanelWorkspace = { owner: string; directory: string; draftRequestId: string | null };

export const usePanelWorkspaceMounts = create<{
  entries: MountedPanelWorkspace[];
  update: (next: (entries: MountedPanelWorkspace[]) => MountedPanelWorkspace[]) => void;
}>((set) => ({ entries: [], update: (next) => set((state) => {
  const entries = next(state.entries);
  return entries === state.entries ? state : { entries };
}) }));
