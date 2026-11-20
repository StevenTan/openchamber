# Browser panel

## Ownership

The panel owns the visible page, viewport projection and agent cursor.
Agent action routing and native execution are described in
`packages/web/server/lib/browser-control/DOCUMENTATION.md`.

## Invariants

- The cursor is a pointer-transparent overlay in the app renderer. It never
  takes keyboard focus or receives page input.
- Cursor positions use page viewport coordinates. Projection accounts for the
  webview's displayed size, position and page zoom, including viewport changes
  made while the cursor stands still.
- The latest pointer request owns the cursor's session and directory. Session
  idle hides it; unrelated snapshots do not change its owner.
- Hidden pages acknowledge moves immediately and run no cursor frame loop.
  Reduced motion places the cursor directly at its target.
- Motion updates transforms outside React. Frame work ends when the cursor
  reaches its target; resizing and later pointer events refresh its position.
- Agent tabs share the panel's browser profile and native dialogs remain under
  user control. Page operations use the official Playwright MCP tools.
- Browser recency and agent activity belong to the layout across its retained
  workspaces. Agent tabs sleep after 30 minutes without an action or a visible
  page; opening or driving a sleeping tab loads its saved address again.

## Decisions

### Why the cursor is outside the webview

The app overlay shares neither DOM nor styles with the visited page. The page
keeps its own event handling, and the pointer stays visible on arbitrary content.

### Why error pages wait only while a project action runs

A local proxy such as portless listens before the app behind it and answers 404 until the app registers, so the page loads and never fails. The webview's own document status, from `did-navigate`, covers `*.localhost` names the host probe refuses. A 404 is also a real app's answer, so it is retried only while the action that opened the page runs and for at most 2 minutes; without the cap, an app whose start page is a 404 would reload for as long as its action lives.
