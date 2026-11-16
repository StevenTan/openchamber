# Child-agent coordination

## Ownership

This managed plugin exposes `collaboration.send_input`, `wait_agent` and
`interrupt_agent`; OpenCode flattens their names with underscores. OpenCode
owns child creation, execution, history and completion notifications.

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
- Wait timeouts, tool cancellation and plugin unload release pending waits.
  They do not interrupt the children. Interrupt explicitly requests
  `resume: false`; acceptance does not imply cleanup has already completed.
- API and permission failures surface as tool failures. No session history,
  status cache or notification queue is maintained by this module.

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
