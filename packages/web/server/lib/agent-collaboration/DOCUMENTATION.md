# Child-agent coordination

## Ownership

This managed plugin exposes `collaboration.send_input`, `wait_agent`,
`interrupt_agent`, and `list_agents`; OpenCode flattens their names with underscores. OpenCode owns native `subagent` definitions, context inheritance, execution,
persisted history and completion notifications.

Web and Electron inject the plugin. Hosted and Capacitor clients use the
connected server's managed instance. External OpenCode and VS Code own their
plugins and receive no injection.

## Invariants

- Targets are direct children of the invoking session. Each operation checks
  the child's current agent against the caller's `subagent` permissions.
  The tools are registered only when OpenCode's native `subagent` tool exists.
- Follow-ups execute the native `subagent` implementation in background mode,
  preserving model selection, job ownership, recovery and completion delivery.
- Waiting uses OpenCode's session wait API and returns when any target becomes
  idle. The returned text and error belong to its latest assistant message.
  Idle is an execution state, not a success verdict. A timeout reports no result.
- `wait_agent` returns an object with `timed_out` and `result`; a timeout has a
  null result. `interrupt_agent` returns an object with `session_id` and
  `interrupted`. Their output schemas expose these fields to Code Mode scripts;
  display content retains the JSON representation.
- Wait timeouts, tool cancellation and plugin unload release pending waits.
  They do not interrupt the children. Interrupt explicitly requests
  `resume: false`; acceptance does not imply cleanup has already completed.
- API and permission failures surface as tool failures. No session history,
  status cache or notification queue is maintained by this module.
- The bundled OpenCode fork accepts `fork_turns: "all" | "none"`, defaulting to `"all"` for new children.
  The native tool creates fresh context for `"none"`. The `"all"`
  mode inherits settled messages before the invoking assistant message and
  that message's recorded content before the invoking tool call,
  including attachments, tool results and compaction summaries. Message IDs and
  compaction `keepID` references are remapped. Child accounting starts at zero.
  Active session instruction entries are copied; the child's selected agent
  supplies its own current agent instructions. Existing children keep their history.
- The current assistant prefix keeps text, reasoning and settled tool results.
  Pending tool calls and content at or after the invoking call are excluded.
  Only the copied prefix is marked complete; the parent stays unchanged.
- `list_agents` reads every page of the invoking session's direct children,
  excludes sessions without an assigned agent, and checks permissions for
  each distinct child agent type. It returns `{ agents }` with `session_id`,
  `title`, `agent`, and `status` fields. Status comes from OpenCode's active
  session registry and is `running` or `idle`; it is a snapshot, not a success
  verdict or detailed activity feed. API or permission failures fail the listing.

The authenticated same-machine callback `/api/openchamber/subagent-wait` verifies
child ownership again. Its SDK requests share the callback's disconnect signal
and the invoking session's in-flight action tracking. Its Node HTTP transport
has no socket timeout; the plugin's wait deadline governs both Web/Bun and
packaged Electron/Node execution.

## Decisions

### Why follow-ups use the native tool

Prompting a finished child directly starts execution without registering a
new background job observer. The native implementation owns both admission
and completion notification for every generation of child work.

### Why waits cross the server callback

OpenCode 2.2.7's Promise plugin bridge ignores request-option signals for session
methods. The server's HTTP SDK supports cancellation, so wait requests use that
boundary to release the underlying wait when the plugin cancels its fetch.

### Why listing crosses the server callback

OpenCode's Promise plugin context exposes session listing but not the active
session registry. The authenticated `/api/openchamber/subagent-list` callback
reads both through the HTTP SDK, with pagination and disconnect cancellation.
The plugin checks child-agent permissions before returning the snapshot.
