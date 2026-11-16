# Shared UI primitives

`DisclosureChevron` keeps one glyph mounted and rotates it for expanded state.
Its closed direction is right, up or down; right-facing disclosures mirror in
RTL. It respects reduced motion. Collapsible panels
transition their measured height and opacity; Base UI owns their
closing lifetime and restores automatic height when opening settles.
Vertical padding belongs to an inner content wrapper, so the panel itself can
reach zero height before unmounting.
The root exposes `data-slot="collapsible"` with Base UI's open and closed state
attributes, so a containing viewport can recognise manual expansion before layout changes.

## Ownership

This folder owns runtime-independent controls and their Base UI integration, including dropdown focus and dismissal. Feature-specific model filtering belongs to `components/model-picker`.

## Invariants

- Closable tabs retain their icons and accessory marks. A trailing close button
  reserves its width at rest, stays visible on the active tab and touch layouts,
  and appears on inactive tabs during hover or keyboard focus. Closing owns its
  pointer input without selecting or dragging the tab.
- `TabMotion` owns tab presence and membership layout transitions. Its outer
  wrapper springs into position while the inner sortable element owns drag
  transforms. Exiting tabs leave layout immediately and are inert while fading;
  reduced motion applies changes directly. Non-closable selectors keep their
  existing selection animations.
- A root dropdown opened by keyboard or controlled state stays open when the pointer leaves its popup. Hover dismissal applies only to a dropdown opened by trigger hover.
- Escape, outside presses, item selection, and window blur retain their normal dismissal behavior. Submenu hover behavior stays with Base UI.
- An open dropdown whose content changes (a filtered picker list, items that arrive late) eases into its new height (`useHeightMorph` in `DropdownMenuContent`); the edge facing the trigger stays where it was in every painted frame.
- Each opening has its own hover-dismissal eligibility; closing clears it.
- Command palette recent sessions and session-name search share the session
  admission filter. Their raw global cache remains complete; registering a
  destination updates the open palette through its project/worktree subscriptions.
- Command palette extension entries (session actions, slash commands) are
  search-only and run what the session header menu and the composer run: a
  session action needs a current session and reads it when picked; a command
  waits in the main composer for its argument and is sent by the user. The
  palette and the slash menu drop the same reserved names
  (`reservedComposerCommandNames`). An entry's `keywords` (the extension's
  name, a command's description) find it too, ranked below entries the query
  matches by their own text, so "task" lists the command `/task` before an
  action of the Task Board extension, and the highlight stays on the title.
- The command palette is its input and one list: no filter chips, tabs or
  typed flags, and nothing kept between openings. Text such as `project:foo`
  is searched as it is typed, and Tab keeps its default behavior.
- With a query the list has a Sessions group (active sessions, by title,
  project, worktree or folder) and right under it an Archived group (archived
  sessions, by title only, three at most). The other name groups sort around
  them by their best match, and Messages comes last.
- Message hits are a preview of three; "Show all" opens a view of message hits
  only, for the same query, with paging. Escape, Backspace on an empty input
  and the Back row return to the full list, and a second Escape closes the
  palette. The view is local state and resets on every opening.
- The palette asks for message hits of active and archived conversations alike
  (`lifecycle: 'all'`) and lists a hit only when its folder passes the session
  admission filter. A hit is marked archived when the archived-session cache
  has its session; the active cache clears a stale mark.
- A second request asks for archived conversations alone
  (`lifecycle: 'archived'`). Its hits that the first request has not listed
  follow the preview's three, three at most, and in "Show all" form an Archived
  group with its own paging.
- An archived session or message hit opens through `openSessionLink`, which
  selects the session and leaves it archived.
- Icon actions over a document (the Files editor, a plan, a page, image or diagram in the chat, diff headers) use `ToolbarButton` from `action-toolbar.tsx`: 24px, a 14px icon, colour-only hover, the selection fill while a toggle is on, faded while disabled. A toggle keeps one icon and one label naming the option; the fill says whether it is on.
- `ActionToolbar` takes the actions a document has, which depend on what the document is and never on its mode, so a mode switch moves no button. Its groups sit apart by space; with `fold`, unpinned actions move into "More actions" from the end of the row while it does not fit, after `start` gave up its width.
- `Textarea` offers emoji on `:` in both modes (`components/emoji/`, placed by `components/inline-picker/`); its forwarded ref is the textarea element itself.
- A bottom sheet's list is built from `MobileSheetList`: `MobileSheetRow` for every option and action, `MobileSheetSection` for its captions, and `MobileSheetSearch` in `MobileOverlayPanel`'s `subheader`, so the field stays put while the list scrolls. The chosen row takes the selection fill and a check. The model sheet draws its own rows to the same measures, because its list is virtual.
- On a phone `DialogContent` is a bottom sheet: `mobile.css` shapes every dialog through `data-slot`, so callers keep one markup for desktop and phone, and the layer's keyboard rider follows the whole keyboard. Tablet layouts and a dialog with `items-start` on its layer keep their centred window.
- Scroll containers use browser-native scrollbars with thin, theme-aware thumbs. The operating system controls their visibility and interaction. `ScrollableOverlay` owns the flex frame, scroll element and optional edge shadows; library-owned scrollers, popups and textareas keep their own native scrollbars.

- Text controls keep their size floor and fit the current line height and
  font-relative vertical padding. Explicit square button sizes stay fixed.
  Active-pill tracks and their containers use minimum heights so labels can
  increase their height with the interface font preference.

## Decisions

### Which tooltip a control takes

`Tooltip` is the base, for anything that is not a plain button, such as a whole row or a label. `ButtonTooltip` (`action-toolbar.tsx`) is one button that sits alone, disabled or not: its span takes the hover a disabled button refuses, and a menu trigger goes inside it. `HoverTooltip` (`row-tooltip.tsx`) is a button repeated in a list that mounts and unmounts rows, such as the transcript: it mounts a root only while hovered, adds no DOM, and needs no provider. `DelegatedTooltip` (`row-tooltip.tsx`) is the buttons of a list that keeps its rows mounted: controls carry `data-row-tooltip`, and one tooltip listens on the list. A `Tooltip` per row in either list would keep thousands of roots for a label that shows at most once.

`HoverTooltip` and `DelegatedTooltip` run their own delay, 300 ms as in the app's `TooltipProvider`, because a tooltip with no trigger of its own never reads the provider.

### Why KeepAlive snapshots before hiding

`onBeforeHide` runs for the outgoing non-null key in React's before-mutation
snapshot phase. Consumers can capture measurable DOM before Activity or a
placeholder host hides it. Layout-effect cleanup can already see hidden nodes,
so it cannot provide the same capture guarantee. Same-key updates do not capture.

### Why the toolbar folds by trying, not by arithmetic

`ActionToolbar` hides actions from the end of the row through a `data-folded` attribute set on the DOM until the row stops overflowing, then renders the menu from what it hid. Counting fixed 24px slots, as the Files toolbar did before, breaks on anything that is not a button: the save status, the inline go-to-line field, labels in other languages. React never renders `data-folded`, so a render keeps the fit until the next one runs on a resize or a changed set of actions.

### Why hover dismissal follows the opening reason

Base UI 1.4 has no opening DOM event when a caller changes the controlled `open` prop, so it treats that popup as hover-dismissible. Filtering can shrink it away from a stationary pointer and close it during typing. The shared dropdown root cancels that hover close unless a trigger-hover event opened the menu, preserving explicit hover menus without caller-specific workarounds.

### Why archived results are a separate group and not a setting

Archived sessions and their messages are always part of the palette's search.
Sessions get an Archived group of their own under the active ones, and a
message hit from one carries an "Archived" tag. A synced setting
"Show archived sessions in command palette", off by default, did this before:
a search that found nothing gave no hint that the answer sat in the archive,
and the setting brought typed flags, a Filters menu and a status line to
explain why results were missing. A separate, short group keeps archived rows
from crowding active ones without anything to configure.

### Why archived message hits get a request of their own

Hits come newest first, and archived conversations are usually the oldest: in
one list they sat pages below every active hit, and the preview of three never
showed one. The first request still asks for every lifecycle, so hits of
unknown lifecycle stay listed; the archived request only adds what that list
has not reached, and an archived hit the list reaches later is shown there
once. A server that ignores the lifecycle parameter answers the archived
request with unmarked hits, and the palette then drops that answer whole.

### Why a message hit of unknown lifecycle is shown as active

A server older than the lifecycle fields sends hits without `archived` and
ignores the lifecycle parameter. The palette asks for everything, so nothing
has to be hidden: the session caches mark the hits they know, and the rest
are listed without the tag. Hiding them, as an active-only request once
required, would drop every hit from a session the caches have not loaded.


### Why the height morph watches content and leaves the position to Base UI

The popup's height follows a `MutationObserver` on its content, not a `ResizeObserver` on the box: the animation itself resizes the box every frame, and a flex child such as the model list shrinks with it, so a size observer would restart the move on every frame. The hook also does not hold the anchored edge itself. Base UI's positioner re-places the popup from its animated height before paint in the same frame, so the edge facing the trigger stays put; a per-frame offset tried first doubled that correction and threw the edge up to 60px off.
