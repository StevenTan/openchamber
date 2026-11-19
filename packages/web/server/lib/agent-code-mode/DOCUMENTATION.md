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
- `tools.store({ key, value })` and `tools.load({ key })` are asynchronous operation
  tools. They keep JSON snapshots in memory, isolated by the native calling
  session ID. Values survive script and turn completion, failure and interruption;
  session deletion and server restart clear them. Store overwrites a key and
  returns `{ key }`; load returns a copy of the value or a catchable error for a
  missing key. Cache contents are ephemeral and are not inherited by forked sessions.

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

Text and directory reads use command tools. `view_image` accepts local PNG, JPEG,
GIF and WebP files through the native reader, preserving file permissions and
image attachments. Its structured result contains only the path and MIME type.
The reader's general file entry is private to these adapters.

Native mutation executors validate each call; callers select the operation matching their edit.
`patchText` accepts file operation sections starting with an action header.
The adapter supplies one native boundary pair before invoking the original patch
executor. Registered descriptions and field annotations state this input contract.
The native schema fields and checks, hunk parser, permissions and mutation logic
retain their ownership.

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

### Session memory lifetime

The process shares the session cache across plugin module activations. OpenCode
can evict an idle Location while its sessions remain usable, so cache ownership
and one deletion-event listener outlive Location scopes. Tool definitions are
created for each activation. Zod's JSON schema validates cached values at the
native tool boundary without sharing Effect parser internals across bundles.
