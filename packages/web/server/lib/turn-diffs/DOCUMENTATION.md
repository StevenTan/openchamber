# Recorded turn file diffs

## Ownership

The managed OpenCode plugin captures file-tool changes and serves persisted
turn patches through `openchamber-turn-diffs.read`. Shared UI owns selection
and rendering. OpenCode owns plugin storage and transcript persistence.

## Invariants

- Native and shared MCP `write`, `edit`, and `patch` tools copy each path's first original bytes into a
  private temporary directory before execution. Repeated calls reuse that
  baseline. Paths outside the project and paths without Git tracking work
  identically. A move records the source and destination as separate paths.
- After completed or failed tools settle, Git compares those baselines against
  actual disk contents, including formatter output and partial writes. The
  comparison follows symlinks on both sides. Unchanged paths disappear from
  the net result; empty file additions and deletions retain their status.
- Records are keyed by session and turn, versioned, and contain only paths,
  patches and statistics. Tool metadata carries references and statistics.
  The most recent admitted prompt or compaction anchors a turn. A notice
  following a final answer anchors the following assistant steps. An answered
  asynchronous question anchors subsequent steps even during an active execution;
  a cancellation alone keeps the current turn.
- A first assistant step creates an empty record even when it runs no file
  tools. RPC reads share the session's write queue, so a pending persisted
  capture cannot be read as an absent record.
- Per-session serialization orders baseline manifests and record writes.
  Capturing does not lock files or resolve concurrent external attribution.
- File executor wrappers capture direct and scripted operations. Operations
  sharing a Code Mode call ID settle as a group before
  saving the final patch. The outer script result carries its diff reference
  and statistics so shared UI reads the same recorded version. Script completion
  and terminal execution events settle captures whose inner calls were rejected
  or interrupted without an `execute.after` hook.
- Terminal execution events clean baselines only after every file's patch is
  generated and persisted. Failed generation retains its manifest and originals
  and marks the affected file unavailable; other files remain readable. Failed
  persistence keeps the manifest dirty, and reads report the turn unavailable.
- Shutdown retains active baselines because OpenCode preserves the unfinished
  execution for continuation. Plugin reload reuses its persisted manifest.
  Session deletion deletes its records and temporary baselines.
- RPC checks the session exists. Missing records and failed captures are
  distinct from a successfully recorded turn with no net changes. No Git
  working-tree diff substitutes for a historical patch.

## Decisions

### Why original bytes live on disk

Filesystem copies avoid retaining full originals in JavaScript memory. The
Git child computes patches; a whole-file rewrite can still produce a large
patch, but unchanged file bodies do not enter persisted turn records.

### Why records live in plugin storage

OpenCode exposes durable plugin storage and RPC, while arbitrary edits to
history messages are not a public plugin API. Companion records keep patch
bodies out of repeated tool messages and preserve records across restarts.
