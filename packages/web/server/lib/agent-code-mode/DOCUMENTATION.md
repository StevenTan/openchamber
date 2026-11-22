# OpenChamber Code Mode

## Ownership

`execution.ts` owns script execution and call activity using the official
`@opencode/codemode` confined interpreter. It consumes tool descriptions, schemas
and executors without importing backend session types or transports. The fetch
extension adapts the upstream OpenCode implementation under the module MIT license.

The vendored tool runtime and wildcard matcher come from OpenCode v2.3.2:
[tool runtime](https://github.com/anomalyco/opencode/blob/v2.3.2/packages/core/src/tool/runtime.ts),
[empty input schema](https://github.com/anomalyco/opencode/blob/v2.3.2/packages/ai/src/tool.ts),
[record predicate](https://github.com/anomalyco/opencode/blob/v2.3.2/packages/util/src/record.ts),
[wildcard matcher](https://github.com/anomalyco/opencode/blob/v2.3.2/packages/core/src/util/wildcard.ts).
They retain upstream runtime behavior with local type imports and the required
helpers included. The adapter owns catalog placement, skill policy, activity and
attachment forwarding.

`plugin.ts` is the managed OpenCode adapter. It registers `openchamber_execute`,
reads the live tool registry and applies the current agent and session permissions.
MCP registrations include built-in services and user-installed servers. Their
existing executors retain MCP connections, authentication and permission checks.

## Invariants

- Each request supplies the complete tool descriptions and parameter signatures
  in its system prefix. Script calls use the listed `tools` paths directly.
  Tools with direct entries show that entry beside their JavaScript signature.
  Namespace diagnostics retain path suggestions and refer to this complete catalog.
  Scripts receive a local `tools` object containing registered roots and namespaces;
  the local `search` binding is undefined. Tool discovery has no callable entry.
- Commands, continuation, sleep, store/load, file operations, browser tools,
  asynchronous questions and control MCP tools have direct and script entries.
  Render, secrets, image generation, workflows and native subagent cards have
  direct entries only.
- Managed requests expose `openchamber_execute` as their script entry. Native
  `execute` and its discovery instructions are excluded from those requests.
- Whole-tool permission denies filter the script inventory on every invocation.
  Individual tool executors own resource-specific approvals. Input decoding uses
  the registered Effect, Standard Schema or JSON Schema contract.
  The plugin imports Effect from the OpenCode host and decodes registered Effect
  schemas directly, preserving their checks, defaults and transformations.
  Tool definitions, argument decoding, output encoding and content normalization
  use the copied OpenCode v2.3.2 tool runtime in `src/vendor/tool-runtime.ts`.
  Permission and skill filters share the upstream wildcard matcher.
- The interpreter uses tools for filesystem and process access. `fetch` retains
  the native HTTP response methods, webfetch approval and redirect deny rules. Calls whose completion matters must be awaited; pending
  calls stop when the script ends. Independent calls support `Promise.allSettled`.
- Results preserve structured tool values. Script text is formatted once; this
  module adds no output truncation. File content returned by tools is attached to
  the outer result, so image viewing remains available inside scripts.
- `toolCalls` carries live progress and `openchamberToolCalls` carries completed
  inputs, outputs, metadata, errors and timing for shared UI projection. Each run
  owns these records, including simultaneous calls with identical arguments.
- File executors own their per-call metadata and turn diff capture for direct and
  scripted calls. The turn-diffs plugin publishes the net change on the outer call.
- Managed Web and Electron servers install the adapter. Hosted and Capacitor
  clients use their connected server. External OpenCode and VS Code own their
  plugin configuration.

## Skill policy

Managed agents use file-backed skills. Request guidance excludes virtual
`skill://` registrations while preserving permissions and automatic-invocation
settings. Both direct and script skill loads reject virtual entries using the
current registry. Context, compaction and transient generation share this policy.
Explicit user skill attachments remain user-provided context.

## Catalog placement

Complete definitions stay in the system prefix for prompt caching. A short
reference after history identifies the current catalog as authoritative without
duplicating definitions or editing stored messages.
