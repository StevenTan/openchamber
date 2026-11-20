# UI store composition

## Ownership

`../useUIStore.ts` creates the persisted Zustand store, attaches devtools and
preserves the public imports used by every UI runtime. Its public hook projects
the current panel workspace over the shared state.
This folder owns its state contract, initial values, persistence, context-tab
transitions, and action groups.

Shared action factories receive the root store's `set`, `get`, and API. Panel
actions capture their workspace owner and write its scoped fields. Calls between
groups go through `get()` so they use the current state and actions.
`contextTabs.ts` normalizes tab identities and targets. `contextPanelState.ts`
owns directory-panel transformations and saved-panel sanitization.
Neighbouring stores still own terminal state and the files view's open paths.

## Invariants

- Shared preferences live in one persisted store. Panel resources and pending
  navigation belong to their owning workspace.
- Initial arrays, maps, templates, and keyboard preferences are created when
  the store initializer runs.
- Persistence keeps the `ui-store` key, version 32, migration ordering, and
  the same saved fields.
- Context-tab actions retain their terminal and files-view side effects.
- Browser tab IDs share one module-level sequence across user and agent tabs.
- Consumers continue to import the store, public types, constants, and helpers
  from `../useUIStore.ts`.

## Decisions

### Why action groups share the store

Each group needs current values from other groups, and callers subscribe to
the existing combined state. Separate Zustand stores would change subscription
and persistence behavior, so these modules only compose the original store.
