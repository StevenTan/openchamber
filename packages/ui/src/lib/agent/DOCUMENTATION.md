# Agent conversations

## Ownership

This module owns the application conversation model, conversation operations and
normalized event subscription and runtime contracts. `active.ts` dispatches
conversation operations through the backend registry. `../agentBackends.ts`
registers the application's backend factories and selects the startup backend.
The OpenCode adapter owns SDK calls, native event decoding
and transport in `../opencode`. Sync owns transcript membership and store writes.

## Invariants

- Conversation, message, part and event identities are identical in history and
  live updates. Adapters project native records before publishing them.
- `ConversationClient` supplies session creation and history, model and agent
  selection, sends, interruption and answers to pending requests.
- Failed authoritative reads reject. Successful empty pages retain their cursor
  semantics; a transport failure cannot become an empty conversation.
- Session records carry `backendID`. Loaded history, new sessions, live creation
  events and persisted records establish runtime-scoped ownership. Operations
  on a known session use its owning backend even when another backend is selected.
  Persisted records without `backendID` belong to OpenCode.
- An `AgentBackend` supplies the conversation client, event source and runtime.
  The source's identity identifies the connection whose replacement restarts sync.
  A subscription owns its existing reconnect and cleanup behavior.
- The runtime supplies health, directory initialization, conversation defaults
  and pending-request snapshots. Native configuration files and authentication
  remain owned by the corresponding adapter and its settings.
- Web, Electron, VS Code, hosted mobile and Capacitor use the same contracts.
  Their runtime transport continues to own authentication and relay routing.

## Decisions

### Conversation and backend extensions

The common client exposes conversation operations. OpenCode-specific filesystem,
configuration and advanced session operations remain with the OpenCode adapter,
alongside the native projections used by those operations.

### Conversation defaults

Shared configuration snapshots contain the default agent and formatted model
selection. Native settings are read and interpreted by the adapter before these
snapshots reach sync and composer selection.

### Transport ownership

The OpenCode event source owns wire ordering and translation before publishing
application events. Sync consumes normalized events and retains its transcript
batching, routing and reconciliation behavior.
