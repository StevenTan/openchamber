# Source attribution

Source: [mateusdcc/codex-search-opencode](https://github.com/mateusdcc/codex-search-opencode)

Revision: `545cbf5ce6bde1491ed4291c5aa9177394d5fd13` (package version `1.1.0`).

Author: Mateus DCC. The upstream `package.json` declares `"license": "MIT"`,
and its README's License section declares MIT. That revision contains no
standalone license file.

Copied modules: `commands.ts`, `provider.ts`, `codex-provider.ts`, `normalize.ts`,
`output.ts`, `web-format.ts`, and `errors.ts`, under `src/vendor`.
The protocol, normalization and output test bodies are under `upstream-tests`.
The tool schemas and browsing guidance in `src/plugin.ts` derive from upstream
`src/opencode-tools.ts`.

The managed adapter supplies OpenCode provider credentials and model settings,
registers OpenCode 2.x tools, renders Markdown links, propagates cancellation
through retry delays, and rejects invalid backend response envelopes.

The extended command fields and request settings follow OpenAI Codex's
`codex-rs/codex-api/src/search.rs`. Browsing guidance is copied from
`codex-rs/ext/web-search/web_run_description.md`, with the tool name adapted to
`codex-research`. Conversation selection follows
`codex-rs/ext/web-search/src/history.rs` and
`codex-rs/tools/src/response_history.rs`. These sources are from
[openai/codex](https://github.com/openai/codex) under Apache-2.0; see
`codex-LICENSE`. UTF-8 token-budget truncation uses the sibling agent-command
module's Codex-derived implementation.
