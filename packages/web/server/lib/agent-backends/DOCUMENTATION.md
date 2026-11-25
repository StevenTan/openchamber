# Conversation backends

## Ownership

The host starts Antigravity through the official ACP SDK. Its process, settings,
native profile and conversation records belong to OpenChamber's data directory.
The executable can be configured in General settings. With the default `agy`
command, the host uses an existing PATH installation or its downloaded binary.
When neither exists, settings offers installation. The install action downloads
the platform release from Google's manifest, checks its SHA-512 digest and places
it under this backend's `bin` directory. Explicit executable overrides are used as configured. Web, Electron and
mobile clients use the host routes; the VS Code extension uses OpenCode.

## Contracts

- A prepared native session belongs to a draft and becomes the first conversation
  when sent. Its ACP configuration supplies the model and thinking-level catalog.
- Creation adopts the composer's host conversation ID while retaining the
  prepared native session and its MCP credential. Credential resolution follows
  the adopted host ID.
- Host message identities and streamed updates are persisted together. Reloading
  history projects those records with the same identities as live updates.
- Archive timestamps belong to the host conversation record. Archive and restore
  use the common session routes and publish native conversation updates.
- Antigravity prompt steering admits additional user messages and asynchronous
  answers into the running turn. The latest prompt's completion ends that turn.
- The custom main agent uses the supplied MCP servers. OpenChamber's MCP services
  perform approvals; ACP permission callbacks admit the call to those services.
- Each native session receives an opaque MCP credential. HTTP headers identify
  direct calls, and Code Mode forwards that credential in nested request metadata.
  Model arguments cannot choose the conversation identity.
- Permission and form events enter the common sync contract. Shared MCP services
  own their tool behavior and resource permissions for both backends.
- Enterprise mode blocks the Antigravity process because its providers are
  outside OpenCode's provider policy.
- Completed turns read the private profile's conversation SQLite database for
  context fill, window size, token and cache counters, using the MIT-licensed Protobuf decoder from
  `nkjDSLcvanv/antigravity-codex-theme`. Database access is read-only; unavailable
  measurements have no fabricated context limit.
- Account quotas use the signed-in ACP worker's localhost
  `RetrieveUserQuotaSummary` endpoint. A native session-list request starts the
  worker without a model turn; the front and worker logs identify its HTTP port.
- Native turn creation and completion anchor the host's shared file diff runtime.
  File mutations persist the reference on the native turn and publish it with
  live updates. Conversation deletion deletes its host diff records; archiving
  retains them.
- Shared MCP handlers persist tool inputs, results and activity metadata under
  `tool-activity/<session-id>.jsonl`. Native turns retain these host records for
  live and history projection, including file patches and interaction answers.
  The original MCP call ID identifies card callbacks.
- Session creation applies the host's default approval mode. Draft submission
  awaits the selected mode before dispatching the first prompt.
- The application session service routes ordinary create, send, status, history
  and interruption to the session's backend. Queued messages and scheduled runs
  select that same service. Native scheduled runs use the host's worktree
  lifecycle; goal mode remains an OpenCode capability.
- Session instructions are stored by the host. The OpenCode adapter delivers
  instruction entries; Antigravity receives their current text with each prompt.
  A user's direct message settles pending page and secret cards. Synthetic queue
  and scheduler messages leave those cards waiting.

## Boundaries

Antigravity retains the five most recently used native sessions. Above that
limit, idle sessions close through ACP while their stored history remains
available. Running prompts and native requests stay resident until they finish.
Reading host history does not start a worker; the next prompt or model change
loads a closed native session with its existing identity.

Native forks, side conversations and subagent management are separate backend
capabilities. The application conversation client covers ordinary conversations;
OpenCode-specific configuration and advanced session operations stay in its
adapter. The ACP wire types have a separate `@openchamber/sdk/agent-backends`
entry point, independent of guest panel APIs.

## Google sign-in

Settings starts `agy acp --login`, displays the Google authorization link and
sends the submitted code to that process's standard input. The host owns the
flow and publishes changes through the shared control stream, so reopening
Settings resumes its current status. The CLI's credential file supplies the
signed-in state after a host restart. Completion requires a
successful native session setup, including its model catalog. Cancellation stops
the login process; sign-out uses ACP's native `logout` request. Login and sign-out
stop running Antigravity conversations while retaining their saved history.

The login and conversation processes share a private `GEMINI_HOME` and file
credential storage. `SSH_CONNECTION` selects the CLI's file storage behavior;
the CLI otherwise uses a shared OS keyring even with
`AGY_ACP_FORCE_FILE_STORAGE=1`. This keeps OpenChamber's Google sign-in separate
from the standalone Antigravity application.
