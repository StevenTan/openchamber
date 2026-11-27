# OpenChamber Code Mode

## Ownership

The authenticated `/api/openchamber/code-mode/mcp` service owns the `execute`
tool. Its `openchamber` MCP registration also exposes the shared memory,
knowledge, usage and notification tools with their existing names.
Page rendering, image generation and secrets have direct MCP entries named
`openchamber_render`, `openchamber_image` and `openchamber_secret`, with dedicated
chat cards. The managed adapter supplies original call ids, answer metadata and
chat-reply cancellation.

`execution.ts` runs JavaScript with the official `@opencode/codemode` confined
interpreter. Command, file, browser, asynchronous question and control tools
connect through official SDK in-memory MCP transports to their existing server
factories. Those services own argument validation, execution and permissions.
Backend-specific tools and externally configured MCP servers keep direct entries.

The managed OpenCode adapter configures MCP discovery and supplies original
session, message and call identity outside model arguments. It forwards live
progress, structured results and images. File MCP calls capture their changes
through the host's shared turn-diffs runtime.
The adapter applies this identity contract to direct calls across all shared MCP
services. Script child calls retain the message identity and receive independent
part IDs. The outer activity retains fetch-extension entries; service calls have
their own recorded activities.

The fetch extension adapts the upstream OpenCode implementation under this
module's MIT license. Skill filtering uses the
[OpenCode v2.3.2 wildcard matcher](https://github.com/anomalyco/opencode/blob/v2.3.2/packages/core/src/util/wildcard.ts).

## Invariants

- The MCP `execute` description contains every available script tool's full
  description, parameter signature and direct entry name. Script calls use those
  `tools` paths. Namespace diagnostics refer to the same catalog. The script's
  local `tools` object contains only registered namespaces; `search` is undefined.
- Shared command, file, browser, asynchronous question and control tools support
  direct and script calls with identical arguments and permission checks.
  Managed requests expose `openchamber_execute` as their script entry.
  Session control, schedules and terminal reads use `tools.openchamber.control`,
  `tools.openchamber.schedule` and `tools.openchamber.terminal`.
- Whole-tool permission denies filter the script inventory on every invocation.
  Individual MCP services own resource-specific approvals and validation.
  OpenCode-specific native tools remain direct. Rendering, image generation and secrets
  are excluded from the script catalog and execution inventory.
- The interpreter accesses processes and files through tools. `fetch` retains
  response methods, webfetch approval and redirect deny rules. Await calls whose
  completion matters; pending calls stop when the script ends. Independent calls
  support `Promise.allSettled`.
- Results preserve structured values and attach tool images to the outer result.
  Script text is formatted once without additional output truncation.
- MCP progress notifications carry live `toolCalls`. Result metadata includes
  `openchamberToolCalls` with inputs, outputs, errors and timing for shared UI
  projection. Each run owns its activity records. The host records the outer
  execution and each service call. Transcript parts show nested service activity
  separately; the outer part carries the script and its returned output.
- Scripted file changes use the original outer call identity and the same
  before/after snapshot capture as direct calls. The backend adapter supplies
  the turn's net change reference for transcript rendering.
- Managed Web and Electron servers install the adapter. Hosted and Capacitor
  clients use their connected server. External OpenCode and VS Code own their
  plugin configuration.

## Skill policy

Managed agents use the shared host skill discovery. Context, compaction and
transient generation list file-backed skills with absolute paths, preserving
permissions and automatic-invocation settings. Models read skills through shell
commands. The native skill tool stays outside the model tool list. Explicit user
skill attachments remain user-provided context.

## Decisions

### Why the catalog lives in the MCP tool description

MCP discovery supplies execution and the complete catalog through the same
backend-neutral definition. The OpenCode adapter only supplies host identity and
presentation metadata; catalog generation belongs to the service that runs scripts.

### Why tools use in-memory MCP connections

Official SDK transports reuse each service's validation, permission checks and
structured results without additional listeners or separate leaf implementations.
The external Code Mode connection uses SSE responses to deliver live progress.
