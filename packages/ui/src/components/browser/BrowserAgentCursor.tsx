import React from 'react';
import { z } from 'zod';
import cursorAsset from '@/assets/browser-agent-cursor.png';
import { AgentCursorMotion } from '@/lib/browser/agentCursorMotion';
import { invokeDesktopCommand } from '@/lib/desktopNative';
import { useSessionStatus } from '@/sync/sync-context';
import { isStageShown } from './useWebviewFocusGuard';

const moveSchema = z.object({ webContentsId: z.number(), moveId: z.number(), requestId: z.string(), x: z.number(), y: z.number(), animate: z.boolean() });
const acknowledge = (moveId: number): void => {
  void invokeDesktopCommand('desktop_browser_cursor_arrived', { moveId })
    .catch(error => console.warn('[browser-cursor] reporting arrival:', error));
};

function SessionLifetime({ sessionId, directory, active, onIdle }: { sessionId: string; directory: string; active: boolean; onIdle: () => void }) {
  const status = useSessionStatus(sessionId, directory);
  React.useEffect(() => { if (!active && status?.type === 'idle') onIdle(); }, [active, onIdle, status?.type]);
  return null;
}

export function BrowserAgentCursor({ webview, stageRef, visible, activeCount, requests, pageUrl, zoomLevel, viewport }: {
  webview: WebviewElement | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  activeCount: number;
  requests: React.RefObject<ReadonlyMap<string, { sessionId: string | null; directory: string }>>;
  pageUrl: string;
  zoomLevel: number;
  viewport: { width: number; height: number; scale: number } | null;
}) {
  const cursorRef = React.useRef<HTMLDivElement | null>(null);
  const hideRef = React.useRef(() => {});
  const hide = React.useCallback(() => hideRef.current(), []);
  const refreshProjection = React.useRef(() => {});
  const [owner, setOwner] = React.useState<{ requestId: string; sessionId: string | null; directory: string } | null>(null);
  const ownerActive = activeCount > 0 && owner !== null && [...requests.current].some(([requestId, request]) => (
    owner.sessionId === null ? requestId === owner.requestId : request.sessionId === owner.sessionId && request.directory === owner.directory
  ));

  React.useEffect(() => {
    const element = cursorRef.current;
    const stage = stageRef.current;
    if (!element || !stage || !webview) return;
    let frame: number | undefined;
    let motion: AgentCursorMotion | undefined;
    let moveId: number | undefined;
    let previousTime = 0;
    let projection = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    let shown = false;
    const draw = () => {
      if (!motion) return;
      const x = projection.x + motion.point.x * projection.scaleX;
      const y = projection.y + motion.point.y * projection.scaleY;
      element.style.transform = `translate3d(${x - 12}px, ${y - 12}px, 0) rotate(${motion.axisRotation}deg) scale(1, ${motion.scootStretch}) rotate(${-motion.axisRotation}deg) rotate(${motion.rotation + motion.scootRotation}deg) scale(${motion.stretch}, 1)`;
    };
    const finish = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      if (moveId !== undefined) acknowledge(moveId);
      moveId = undefined;
    };
    const hideCursor = () => {
      finish();
      element.style.opacity = '0';
      shown = false;
    };
    hideRef.current = hideCursor;
    const animate = (now: number) => {
      const seconds = previousTime === 0 ? 1 / 60 : Math.min((now - previousTime) / 1000, 1 / 30);
      previousTime = now;
      const arrived = motion!.advance(seconds);
      draw();
      if (arrived) finish();
      else frame = requestAnimationFrame(animate);
    };
    const project = () => {
      const rect = webview.getBoundingClientRect();
      const parent = stage.getBoundingClientRect();
      const zoom = webview.getZoomFactor();
      projection = { x: rect.left - parent.left, y: rect.top - parent.top, scaleX: rect.width / webview.clientWidth * zoom, scaleY: rect.height / webview.clientHeight * zoom };
      draw();
    };
    refreshProjection.current = () => { if (shown) project(); };
    const onMove = (event: Event) => {
      // SAFETY: The desktop bridge emits CustomEvent; its detail is validated below.
      const parsed = moveSchema.safeParse((event as CustomEvent<unknown>).detail);
      if (!parsed.success || parsed.data.webContentsId !== webview.getWebContentsId()) return;
      const move = parsed.data;
      const request = requests.current.get(move.requestId);
      if (!request) { acknowledge(move.moveId); return; }
      setOwner(current => current?.requestId === move.requestId ? current : { requestId: move.requestId, sessionId: request.sessionId, directory: request.directory });
      finish();
      moveId = move.moveId;
      if (!visible || document.visibilityState !== 'visible' || !isStageShown(stage)) {
        hideCursor();
        return;
      }
      project();
      const point = { x: move.x, y: move.y };
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!motion || !shown || reducedMotion || !move.animate) {
        motion = new AgentCursorMotion(point);
        draw();
        finish();
      } else {
        motion.move(point, { width: webview.clientWidth / webview.getZoomFactor(), height: webview.clientHeight / webview.getZoomFactor() });
        previousTime = 0;
        frame = requestAnimationFrame(animate);
      }
      element.style.opacity = '1';
      shown = true;
    };
    const onVisibility = () => { if (document.visibilityState !== 'visible') hideCursor(); };
    const resize = new ResizeObserver(() => { if (shown) project(); });
    resize.observe(stage);
    resize.observe(webview);
    window.addEventListener('openchamber:browser-agent-cursor', onMove);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      hideCursor();
      hideRef.current = () => {};
      refreshProjection.current = () => {};
      resize.disconnect();
      window.removeEventListener('openchamber:browser-agent-cursor', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pageUrl, requests, stageRef, visible, webview]);

  React.useEffect(() => { refreshProjection.current(); }, [viewport, zoomLevel]);

  React.useEffect(() => {
    if (!visible || (!ownerActive && owner?.sessionId == null)) hide();
  }, [ownerActive, owner?.sessionId, hide, visible]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-testid="browser-agent-cursor-overlay">
      {owner?.sessionId ? <SessionLifetime sessionId={owner.sessionId} directory={owner.directory} active={ownerActive} onIdle={hide} /> : null}
      <div ref={cursorRef} data-testid="browser-agent-cursor" style={{ position: 'absolute', top: 0, left: 0, width: 24, height: 24, opacity: 0, transformOrigin: '12px 12px', willChange: 'transform', transition: 'opacity 180ms' }}>
        <div style={{ transform: 'translate3d(12px, -2.5px, 0)' }}>
          <img src={cursorAsset} alt="" draggable={false} width={23} height={24} style={{ display: 'block', transform: 'rotate(44deg)', transformOrigin: '0 0', filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--primary-base) 90%, transparent)) drop-shadow(0 0 15px color-mix(in srgb, var(--primary-base) 48%, transparent))' }} />
        </div>
      </div>
    </div>
  );
}
