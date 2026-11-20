import React from 'react';
import { createPortal } from 'react-dom';
import type { ContextZone } from '@/lib/workspace/zones';
import { useZoneHostsApi, useZoneHostsStore } from './zoneHosts';

type HostParent = HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };

export const MovablePane: React.FC<{ zone: ContextZone; children: React.ReactNode }> = ({ zone, children }) => {
  const hosts = useZoneHostsApi();
  const [node] = React.useState(() => {
    const element = document.createElement('div');
    element.style.display = 'contents';
    return element;
  });
  const host = useZoneHostsStore((state) => state.body[zone]);

  React.useLayoutEffect(() => {
    // The frame registers its body from a ref, earlier in the same commit, so
    // a pane lands in its final zone on first attach.
    const parent: HostParent | null = host ?? hosts.getState().body[zone];
    if (!parent) {
      node.remove();
      return;
    }
    if (node.parentElement === parent) return;
    const focused = document.activeElement;
    if (parent.moveBefore && node.isConnected) {
      parent.moveBefore(node, null);
    } else {
      parent.append(node);
    }
    if (focused instanceof HTMLElement && node.contains(focused) && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
  }, [host, node, zone, hosts]);

  React.useLayoutEffect(() => () => node.remove(), [node]);

  return createPortal(children, node);
};
