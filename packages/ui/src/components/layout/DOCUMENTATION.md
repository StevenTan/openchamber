# Layout

This file covers the header's session tabs and the context panel's file tab
strip and menu. The tab store, its scopes and seeding are owned by
`stores/DOCUMENTATION.md` (`useSessionTabsStore`).

## Context panel file tab menu

The menu of a file tab in `ContextPanel.tsx` acts on the right-clicked tab,
including when it is inactive. Copy relative path uses the current project
directory (`contextPanelPaths.ts`, which also labels same-named tabs); reveal
shows only where the file tree offers it (`files.revealPath` outside a browser
client). VS Code does not mount `ContextPanel`, so it has no such menu.

## Context panel file tabs

`ContextPanel` owns the open-file strip in each workspace zone. Its editor mounts `FilesView` in editor-only mode, which omits that view's own tab row. The file strip enables `SortableTabsStrip`'s `scrollWithWheel` option, so a regular vertical mouse wheel reaches tabs past either edge without changing the open file or showing a scrollbar. Other context panel tab modes keep their existing wheel behavior.

## Displayed session workspace

`WorkspaceSession` supplies one displayed selection to the main chat, context
zones, rail and fit arbiter. Session-list navigation publishes its selection
immediately; the displayed workspace uses `useShownSessionSelection` to keep
the previous workspace while the target's messages load, then commits its
session, resource directory, draft and panel owner together. Pinned chats and
standalone runtimes own that same presentation policy within their column.

### Why panels follow the displayed selection

The transcript can retain its previous session during a deferred render or
message load. Its panel geometry and actions must retain the same owner until
that render commits, so outgoing text keeps its width and visible controls
act on the workspace on screen. The fit arbiter captures this owner's store;
background panel and browser resources keep their own mounted identity.

## Header session tabs

`SessionTabsStrip.tsx` is the header's horizontal working set of sessions, in
the web and desktop header while `sessionTabsEnabled` is on. VS Code and the
setting turned off keep the plain session title (`Header.tsx`). The VS Code
chat header (`VSCodeHeader` in `VSCodeLayout.tsx`) keeps the title as the
session switcher and puts a "⋯" menu beside it with Rename only; the other
session actions stay in the session list. The `rename_current_session`
shortcut opens the same field there; only the chat header on screen takes it,
so the compact layout's chat header, mounted behind the sessions list, and a
new-session draft decline it.

- The store keeps ids and order only. An id whose session is not in the
  loaded list stays stored and does not render, so a partial session list
  never destroys the working set.
- Every tab has the same fixed width (`w-44`); tabs that shrink as more open
  were considered and rejected by the maintainer. Overflow scrolls, with an
  edge fade while tabs hide behind it.
- A long title fades out at its end (`.session-tab-title` in `index.css`)
  rather than ending in an ellipsis, which read as clutter next to the state
  mark.
- The project icon stays at the start. Running and unread marks follow the
  title, before a reserved trailing close slot. The active tab's close control
  stays visible; inactive controls appear on hover or keyboard focus. Renaming
  hides the close control while keeping its slot's width.
- Tab additions and closures use `TabMotion`: entering and exiting tabs fade
  and scale, and neighbouring tabs spring into position. The draft participates
  in the same lifetime. Drag transforms stay on an inner element; reordering
  uses the drag controller's animation. Reduced motion applies changes directly.
- The session menu opens on right-click only, without changing the active
  tab. It is the sidebar row's session menu (`SessionActionsMenuItems` in
  `components/session/sidebar/sessions/`, through
  `HeaderSessionActionsMenuItems.tsx`), with Close other tabs first, and acts
  on the clicked tab's session whether it is active or not. The title's "⋯"
  menu, with tabs off, is the same menu for the current session. A new tab affordance follows the sidebar row patterns
  (`components/session/sidebar/DOCUMENTATION.md`): revealed on hover, menu on
  right-click.
- A "+" right after the last tab, outside the scroller so it stays in view,
  opens a new draft in the folder the tabs belong to. While tabs are shown the
  titlebar's New session button is hidden (`TitlebarLeftControls.tsx`), since
  it would be a second button starting the session in the project root; a
  full-page surface hides the tabs and brings it back.
- An open new-session draft is a tab at the end, titled with the first line of
  its saved text, else "New session". Leaving the draft removes the tab; the
  draft stays in the sidebar.
- In the desktop app Cmd/Ctrl+W closes the open session tab and activates its
  neighbour, and with nothing to close it closes the window. Web keeps the
  configurable `close_session_tab` shortcut (Alt+W by default), since the
  browser owns Cmd/Ctrl+W.
  Context zones register their own close target: multi-tab surfaces close the
  active tab, while single-page surfaces and the Tracker's branch tab close
  their zone. File editors retain their unsaved-edits prompt and terminals
  close their own active terminal tab. Clicking the chat returns the shortcut
  to the session tabs.
  Temporary side-chat tabs confirm permanent session deletion through
  `SideChatCloseConfirmDialog`, including shortcut and batch closures. Saved
  chats close without deletion. Hiding a context zone retains its tabs.
