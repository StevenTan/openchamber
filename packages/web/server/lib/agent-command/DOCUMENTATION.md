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
- `yield_time_ms` bounds one wait. A running command remains available through
  its `session_id`. Completion closes native handles and retains output for
  inspection. Each owner retains up to 100 completed commands.
- Output uses Desktop Commander's line buffer and pagination. The buffer retains
  up to 50 Mi characters per command, with lines split at 1 Mi characters.
  `max_output_chars` bounds a response preview. `truncated` reports omitted output.
- Default reads advance the line cursor. An unfinished line is returned again
  when it changes. `offset` and `length` inspect retained lines; negative offsets
  count from the end. `read_from` and `total_lines` describe the retained buffer.
- Each continuation waits independently. Input and cancellation reach the
  process while another continuation is waiting.
- Commands run in a PTY. Input is sent verbatim. Empty input only waits.
  Standard output and error share the terminal stream.
- The plugin checks OpenCode's shell permission before launching commands and
  sending terminal input. Launch permissions use OpenCode's portable shell
  scanner and directory analysis, vendored with its MIT notice in `vendor`.
  An external working directory requires its directory permission. Ctrl+C
  interrupts the existing command without launching another.
- Cancelling a launch terminates that launch's process. Cancelling a continuation
  stops its wait. Session deletion and server shutdown terminate owned processes;
  plugin refresh preserves command handles.
- `clock.sleep` accepts integer durations from 1 millisecond to 12 hours and
  reports elapsed time. The session's prompt hook wakes active sleeps when new
  input arrives. Tool cancellation and plugin unload reject pending sleeps and
  clear their timers.

## Decisions

### Why the server owns processes

The server already packages the native PTY dependencies. The generated plugin
uses an authenticated callback, so OpenCode needs no native dependency installed
in its generated plugin directory.

### Source ownership

`src/terminal-manager.ts` and `src/process-detection.ts` are copied and adapted from
Desktop Commander's MIT-licensed `src/terminal-manager.ts` and
`src/utils/process-detection.ts`. The wait loop comes from
`src/tools/improved-process-tools.ts`. Their copyright and permission notice are
in `LICENSE`. `src/process.ts` adapts process creation to OpenChamber's PTY
provider; `src/runtime.ts` and `src/plugin.ts` own the authenticated OpenCode
integration. `src/vendor/shell-permissions.ts` retains OpenCode's TypeScript
scanner and permission parser with its license in `vendor/LICENSE`.

### Build boundary

TypeScript in `src` is the maintained source. `bun run build:server` in
`packages/web` checks it with strict types, then emits JavaScript into `dist`.
The server loads `dist/runtime.js`; generated files are ignored by Git.
The separate emit configuration skips duplicate checking after the strict pass.

Web builds, package preparation, tests and development startup compile this
module. The development server runs a TypeScript watcher beside its JavaScript
watcher. Electron's web-assets build uses the same compilation step, so packaged
Node runtimes load JavaScript from the workspace package.
