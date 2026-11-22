# Native Code Mode catalog

## Ownership

Managed OpenCode uses its native `execute` interpreter, validation, permissions,
tool hooks and result processing. This plugin selects operation tools and supplies
their complete descriptions and generated signatures before each model request.
The pinned official `@opencode/codemode` dependency generates descriptors only.

## Invariants

- Operation tools enter native Code Mode. Page, secret, image, workflow and native
  subagent cards keep direct entries because their UI reads the top-level call.
  Asynchronous question forms and child-agent controls support script calls.
  Command execution, continuation, sleep, session memory, file mutations and image viewing keep their native MCP direct entries.
- Code Mode tools are pinned, so their native catalog listings include complete
  parameter signatures.
- The request catalog uses the registered schemas and descriptions, filtered by
  the invoking agent and session's whole-tool permission rules. Resource-specific
  permissions remain the original tool executor's responsibility.
- The complete catalog replaces the `core/codemode` baseline source in outgoing
  context. Other instruction sources retain their text. Each request names its
  available direct tools separately. Disabling native `execute` retains OpenCode's
  direct-call behavior.
- A final request message identifies the complete system catalog as authoritative
  for tool availability and parameter signatures. Persisted instruction notices
  retain their other contents, including notices combining several sources.
- The plugin runs on managed Web and Electron servers. Hosted and Capacitor clients
  use their connected server; external OpenCode and VS Code own their plugins.

## Decisions

### Native execution ownership

Catalog generation uses the official library while tool execution stays inside
OpenCode, preserving its execution hooks and cancellation boundaries. Tool IDs,
permissions and output contracts remain owned by their existing modules.

### Recorded call activity

`call-activity.ts` records each ordinary inner call's input, timing, encoded text
result, metadata and failure. Invocation-local markers keep simultaneous calls
with identical arguments separate and are cleared before results are published.
The native `execute.after` hook supplies encoded output; the wrapper preserves
the executor's returned values and failure causes.

The outer result carries these records in `openchamberToolCalls` for UI
projection. Native `toolCalls` remains authoritative for script progress and
calls rejected before execution. Dedicated direct cards retain their own path.
Rich records settle with the outer after-hook. Native permission declines and
interrupts bypass that hook; those scripts retain native activity and recorded
turn diffs, without rich per-call results. Session terminal events clear pending
capture state. The plugin does not write or replay model-facing messages.

### File operation catalog

Text and directory reads use command tools. The shared file MCP service owns
`file_write`, `file_edit`, `file_patch` and `file_view_image`, with direct entries.
Their descriptions and schemas come from MCP discovery. File permissions and
activity metadata are supplied by the file policy plugin; recorded turn patches
remain owned by the turn-diffs plugin.

### Skill availability

Managed agents use file-backed skills. The request hook supplies native-format
skill guidance with virtual `skill://` entries excluded, preserving skill
permissions and automatic-invocation settings. The `skill` before-hook rejects
virtual entries using the current registry, including entries from plugins
activated later. File-backed skills retain the native loader and its permissions.
Registration remains owned by OpenCode; this policy governs model discovery and
tool loading and does not rewrite plugin data or materialize virtual resources.
The same directory policy covers compaction and transient generation. Current
guidance takes precedence over persisted catalog notices. Explicit user skill
attachments and existing transcript contents remain user-provided context.

### Catalog placement

Complete descriptions stay in the system prefix for prompt caching. A short
reference after conversation history resolves the precedence of historical
Code Mode notices without duplicating definitions or editing stored messages.

### Session memory ownership

The command MCP service owns session-local JSON snapshots and their lifecycle
(`../agent-command/DOCUMENTATION.md`). The catalog keeps those tools on the
native direct list alongside command execution and sleep.
