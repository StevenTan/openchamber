# Agent command tools

## Ownership

This module owns command processes for managed OpenCode sessions, their output
buffers, and the `openchamber-command-tool` plugin. `exec_command` starts a process;
`write_stdin` waits on it, reads new output, and sends raw PTY input.
The same plugin provides `clock.sleep`, exposed as `clock_sleep` on OpenCode's
direct tool list. Its timer runs in the plugin process.
The neighbouring `terminal` module owns the user's visible terminals and the
shared PTY provider and process-tree shutdown implementation.

The agent-tool runtime supplies same-machine callback authentication and the
managed-child environment. The managed config registers this plugin for Web and
Electron. Hosted and Capacitor mobile clients use those server-side processes.
External OpenCode and VS Code lifecycles receive no plugin injection.

## Invariants

- Each command belongs to the OpenCode session that started it. Other sessions
  cannot read its output or send input through its handle.
- `yield_time_ms` collects output until the deadline or process completion;
  individual output chunks do not end a wait. A running command remains available through
  its `session_id`. Completion closes native handles and retains output for
  inspection. Each owner retains up to 100 completed commands.
- Command startup defaults to 10000 ms and clamps to 250-30000 ms, with a
  10000 ms minimum on Windows. Non-empty writes default to 250 ms and clamp to
  250-30000 ms; empty waits default to 5000 ms and clamp to 5000-300000 ms.
- Output uses Desktop Commander's line buffer and pagination. The buffer retains
  up to 50 Mi characters per command, with lines split at 1 Mi characters.
  `max_output_tokens` defaults to 10000 approximate tokens, at four UTF-8 bytes
  per token. Previews retain the beginning and end on character boundaries;
  omission markers are additional to the retained-text budget. `truncated`
  reports omitted output.
- Default reads advance the line cursor. An unfinished line is returned again
  when it changes. `offset` and `length` inspect retained lines; negative offsets
  count from the end. `read_from` and `total_lines` describe the retained buffer.
- Each continuation waits independently. Input and cancellation reach the
  process while another continuation is waiting.
- Commands use output pipes and closed stdin by default. `tty: true` allocates
  a PTY with verbatim input and a shared standard-output/error terminal stream.
  Empty input only waits. Ctrl+C interrupts commands in either mode; other
  input requires a PTY.
- A pipe command owns its POSIX process group. On command exit, remaining jobs
  in that group terminate before the session completes. Tasks that explicitly
  detach from the group have their own lifecycle.
- The plugin checks OpenCode's shell permission before launching commands and
  sending terminal input. Launch permissions use OpenCode's portable shell
  scanner and directory analysis, vendored with its MIT notice in `vendor`.
  `shell` selects the binary for both permission analysis and process creation;
  omitting it uses the user's default shell. Selecting a different executable
  requires its own shell permission, expressed as a quoted executable, in addition
  to the permissions for the command text.
  An external working directory requires its directory permission. Ctrl+C
  interrupts the existing command without launching another.
- Cancelling a launch terminates that launch's process. Cancelling a continuation
  stops its wait. Session deletion and server shutdown terminate owned processes;
  shutdown also waits for pending launches to finish cleanup. Plugin refresh
  preserves command handles.
- `clock.sleep` accepts integer durations from 1 millisecond to 12 hours and
  reports elapsed time. A sleep registers for wake-up before querying the
  session's durable inbox. Existing queued input and subsequent inbox-enqueued
  events end it early. Tool cancellation and plugin unload reject pending sleeps,
  clear timers and cancel outstanding inbox queries. Inbox-query and event-stream
  failures surface as tool errors.

## Decisions

### Why the server owns processes

The server already packages the native PTY dependencies. The generated plugin
uses an authenticated callback, so OpenCode needs no native dependency installed
in its generated plugin directory.

### Source ownership

`src/terminal-manager.ts` and `src/process-detection.ts` are copied and adapted from
Desktop Commander's MIT-licensed `src/terminal-manager.ts` and
`src/utils/process-detection.ts`. Their copyright and permission notice are
in `LICENSE`. `src/process.ts` owns pipe creation and adapts interactive process
creation to OpenChamber's PTY provider; `src/runtime.ts` and `src/plugin.ts` own the authenticated OpenCode
integration. `src/vendor/shell-permissions.ts` retains OpenCode's TypeScript
scanner and permission parser with its license in `vendor/LICENSE`.
`src/output.ts` adapts Codex's token-budget truncation from
`codex-rs/utils/string/src/truncate.rs`, under Apache-2.0 in `vendor/codex-LICENSE`.

### Authoritative pending input

The server queries OpenCode's session inbox for each sleep. The plugin subscribes
to durable inbox-enqueued events for active waits. Reading current queue state
handles delivery, cancellation and plugin reload without a second queue projection.

### Pipe completion

Process exit and pipe closure are separate events: descendants can keep inherited
pipes open. After the command exits, output drains for up to 50 milliseconds;
remaining pipe handles then close so those descendants cannot hold its completion
open indefinitely. Running commands retain their pipes throughout execution.

### Build boundary

TypeScript in `src` is the maintained source. `bun run build:server` in
`packages/web` checks it with strict types, then emits JavaScript into `dist`.
The server loads `dist/runtime.js`; generated files are ignored by Git.
The separate emit configuration skips duplicate checking after the strict pass.

Web builds, package preparation, tests and development startup compile this
module. The development server runs a TypeScript watcher beside its JavaScript
watcher. Electron's web-assets build uses the same compilation step, so packaged
Node runtimes load JavaScript from the workspace package.
