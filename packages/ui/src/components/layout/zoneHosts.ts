import { create, useStore } from 'zustand';
import { useContext } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { PanelWorkspaceOwnerContext, getPanelWorkspaceOwner } from '@/lib/workspace/panelOwner';
import type { ContextZone } from '@/lib/workspace/zones';

type ZoneElements = { left: HTMLElement | null; right: HTMLElement | null; bottom: HTMLElement | null };

type ZoneHostsState = {
  body: ZoneElements;
  headerSlot: ZoneElements;
};

const EMPTY = { left: null, right: null, bottom: null } satisfies ZoneElements;

const createZoneHostsStore = () => create<ZoneHostsState>(() => ({
  body: EMPTY,
  headerSlot: EMPTY,
}));

const setElement = (key: 'body' | 'headerSlot', zone: ContextZone, element: HTMLElement | null, owner = getPanelWorkspaceOwner()): void => {
  const store = getZoneHostsStore(owner);
  const current = store.getState()[key];
  if (current[zone] === element) return;
  store.setState({ [key]: { ...current, [zone]: element } });
};

export const setZoneBody = (zone: ContextZone, element: HTMLElement | null, owner?: string): void => setElement('body', zone, element, owner);

export const setZoneHeaderSlot = (zone: ContextZone, element: HTMLElement | null, owner?: string): void => setElement('headerSlot', zone, element, owner);

const stores = new Map<string, ReturnType<typeof createZoneHostsStore>>();
const getZoneHostsStore = (owner = getPanelWorkspaceOwner()) => {
  let store = stores.get(owner);
  if (!store) { store = createZoneHostsStore(); stores.set(owner, store); }
  return store;
};
export const useZoneHostsApi = () => {
  const pinned = useContext(PanelWorkspaceOwnerContext);
  const owner = useUIStore((state) => state.panelWorkspaceOwnerId);
  return getZoneHostsStore(pinned ?? owner);
};
export const useZoneHostsStore = Object.assign(
  function useZoneHostsStore<T>(selector: (state: ZoneHostsState) => T): T { return useStore(useZoneHostsApi(), selector); },
  {
    getState: () => getZoneHostsStore().getState(),
    // SAFETY: The forwarding callback accepts the underlying store's overloaded update argument.
    setState: ((update) => getZoneHostsStore().setState(update)) as ReturnType<typeof createZoneHostsStore>['setState'],
  },
);
