# Shared file tools

## Ownership

The file MCP service owns local writes, text replacement, multi-file patches and
image attachments. Managed OpenCode discovers `file_write`, `file_edit`,
`file_patch` and `file_view_image` as direct MCP tools. The shared permission service checks
file access before execution; its OpenCode plugin supplies activity metadata. The turn-diffs plugin owns
persisted turn patches; shared UI renders those records.

Web and Electron managed servers register the service. Hosted and Capacitor
clients use their connected server. External OpenCode and VS Code manage their
own plugins.

## Invariants

- The authenticated MCP endpoint resolves the calling session's directory from
  the injected shared context resolver. Model arguments contain file operations only.
- Relative paths resolve against the session directory. External targets require
  `external_directory` approval before `read` or `edit` approval. Mutation approval
  shows the proposed file diffs.
- File mutations retain UTF-8 BOM handling and the upstream text matching and
  patch semantics. Patch input accepts action sections with optional outer
  boundary lines; the service supplies them for body-only input. Edits preserve
  source line endings; patches use the upstream patch parser's line-ending behavior.
- Mutation execution serializes overlapping file targets in the server process.
  All patch hunks are prepared before writes begin. A write failure reports
  completed paths; recorded turn diffs compare actual disk contents.
- Writes apply the requested content. Project formatting commands run separately
  through command tools.
- Mutation results contain a message and file diffs. The OpenCode after-hook
  supplies their activity metadata. Image results contain the resolved path and
  MIME type, with PNG, JPEG, GIF or WebP bytes carried as MCP image content.

## Decisions

### Shared execution and backend permissions

The service executes filesystem operations independently of an agent backend.
The service checks the calling session's shared permission policy before reading
images or applying mutations. OpenCode supplies its configured rules and saved
approvals through the backend adapter. Transport authentication stays in the
agent-tool runtime.

### Upstream algorithms

The patch parser, edit matching, BOM helpers and keyed mutation locking are
adapted from OpenCode v2.3.2 under its MIT license. The `diff` library generates
approval previews and result diffs using the upstream file-diff implementation.
