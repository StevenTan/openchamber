# Agent conversations

## Ownership

This module owns the application conversation model, conversation operations and
normalized event subscription contract. `active.ts` composes the application's
conversation client. The OpenCode adapter owns SDK calls, native event decoding
and transport in `../opencode`. Sync owns transcript membership and store writes.

## Invariants

- Conversation, message, part and event identities are identical in history and
  live updates. Adapters project native records before publishing them.
- `ConversationClient` supplies session creation and history, model and agent
  selection, sends, interruption and answers to pending requests.
- Failed authoritative reads reject. Successful empty pages retain their cursor
  semantics; a transport failure cannot become an empty conversation.
- An `AgentBackend` supplies the conversation client and its event source.
  The source's identity identifies the connection whose replacement restarts sync.
  A subscription owns its existing reconnect and cleanup behavior.
- Web, Electron, VS Code, hosted mobile and Capacitor use the same contracts.
  Their runtime transport continues to own authentication and relay routing.

## Decisions

### Conversation and backend extensions

The common client exposes conversation operations. OpenCode-specific filesystem,
configuration and advanced session operations remain with the OpenCode adapter,
alongside the native projections used by those operations.

### Transport ownership

The OpenCode event source owns wire ordering and translation before publishing
application events. Sync consumes normalized events and retains its transcript
batching, routing and reconciliation behavior.
