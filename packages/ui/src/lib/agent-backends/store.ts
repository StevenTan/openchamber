import { create } from 'zustand';
import type { AgentBackendId } from './model';

export const useAgentBackendStore = create<{
  draftBackend: AgentBackendId;
  selectDraftBackend: (backend: AgentBackendId) => void;
}>((set) => ({ draftBackend: 'opencode', selectDraftBackend: draftBackend => set({ draftBackend }) }));
