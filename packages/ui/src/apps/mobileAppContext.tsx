/* oxlint-disable react/only-export-components */
import React from 'react';
import type { ProjectRef } from '@/lib/projectContextApi';

export type MobileAppActions = {
  /**
   * Open the Changes surface as a modal and (optionally) navigate it to a specific diff.
   * Scope `turn` opens the recorded changes of the selected user message.
   */
  openChanges: (options?: { diffPath?: string | null; staged?: boolean; scope?: 'turn'; turnId?: string }) => void;
  /** Open the Files surface as a modal. */
  openFiles: () => void;
  openSourceBoard: () => void;
  openPlan: (plan: { id: string; title: string; projectRef: ProjectRef }) => void;
  openReceivedPage: (page: { receivedId: string; title: string }) => void;
};

const DedicatedMobileAppContext = React.createContext<MobileAppActions | null>(null);

export const DedicatedMobileAppProvider: React.FC<{
  actions: MobileAppActions;
  children: React.ReactNode;
}> = ({ actions, children }) => (
  <DedicatedMobileAppContext.Provider value={actions}>{children}</DedicatedMobileAppContext.Provider>
);

export const useMobileAppActions = (): MobileAppActions | null => React.useContext(DedicatedMobileAppContext);
