# Recorded turn file diffs

## Ownership

The OpenChamber host captures shared file MCP changes and persists turn patches.
Backend adapters supply session and turn identities. Shared UI reads
`/api/openchamber/turn-diffs` and owns selection and rendering.

Records live at `<dataDir>/turn-diffs/<sessionID>/<turnID>.json`. The data directory
defaults to `~/.config/openchamber` and follows `OPENCHAMBER_DATA_DIR`. Active
manifests and original bytes live under the session's `active/<turnID>` directory
on the server host. The managed OpenCode plugin imports its existing records and
baselines into this store and deletes the imported plugin keys after success.
Recording requires an OpenChamber-managed backend. Standalone OpenCode and
VS Code plugin installations do not establish this host connection.

## Invariants

- Shared MCP `write`, `edit`, and `patch` tools copy each path's first original bytes into a
  private baseline directory before execution. Repeated calls reuse that
  baseline. Paths outside the project and paths without Git tracking work
  identically. A move records the source and destination as separate paths.
- After completed or failed tools settle, Git compares those baselines against
  actual disk contents, including formatter output and partial writes. The
  comparison follows symlinks on both sides. Unchanged paths disappear from
  the net result; empty file additions and deletions retain their status.
- Records are keyed by session and turn, versioned, and contain the working
  directory, paths, patches and statistics. Tool metadata carries references and statistics.
  OpenCode's most recent admitted prompt or compaction anchors a turn. A notice
  following a final answer anchors the following assistant steps. An answered
  asynchronous question anchors subsequent steps even during an active execution;
  a cancellation alone keeps the current turn. Antigravity uses its host turn ID
  and persists the diff reference with the turn's streamed updates.
- Starting a turn creates an empty record even when it runs no file
  tools. Reads share the session's write queue, so a pending persisted
  capture cannot be read as an absent record.
- Per-session serialization orders baseline manifests and record writes.
  Capturing does not lock files or resolve concurrent external attribution.
- Direct and Code Mode operations execute through the same file MCP capture
  boundary. Concurrent operations settle before saving the net patch. The
  OpenCode adapter attaches the reference to the outer script result;
  Antigravity's transcript projection attaches the turn's saved reference.
- Terminal execution events clean baselines only after every file's patch is
  generated and persisted. Failed generation retains its manifest and originals
  and marks the affected file unavailable; other files remain readable. Failed
  persistence keeps the manifest dirty, and reads report the turn unavailable.
- Shutdown retains active baselines for continuation. The next file operation
  reuses its persisted manifest. Archive keeps records; session deletion deletes
  its records and baselines.
- The VS Code route forwards reads through `openchamber-turn-diffs.read` RPC,
  which checks the OpenCode session exists. Missing records and failed captures are
  distinct from a successfully recorded turn with no net changes. No Git
  working-tree diff substitutes for a historical patch.

## Decisions

### Why original bytes live on disk

Filesystem copies avoid retaining full originals in JavaScript memory. The
Git child computes patches; a whole-file rewrite can still produce a large
patch, but unchanged file bodies do not enter persisted turn records.

### Why records live in host storage

The shared file MCP service observes mutations from both backends. Host records
keep patch bodies out of repeated tool messages and preserve historical patches
after workspace files change. Shell commands do not produce recorded turn diffs.
