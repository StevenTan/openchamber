# Managed Codex Web Search

`runtime.js` materializes a self-contained OpenCode 2.x plugin in the managed
instance directory. `src/plugin.ts` owns registration, provider selection and
permissions. `src/vendor` contains the search protocol and formatting code from
`codex-search-opencode`; provenance is in `UPSTREAM.md`.

## Runtime contract

The `native` search provider uses a configured Codex-compatible proxy's
`<baseURL>/alpha/search` endpoint. It requires a configured API key. The enabled
model with `settings.websearch: "always"` takes precedence; otherwise direct tool
calls use the current assistant message's model. Provider API queries without a
session use the global default model. Model-level `baseURL` overrides
provider-level `baseURL`. Credentials, headers and model settings are resolved on
each call. The request carries search commands, model and a session identifier.
Recent context follows Codex's `recent_input` contract: the last two user texts
and intervening assistant text, with a shared approximate 1000-token assistant
budget. Tool output, reasoning, system/developer messages and attachment data
are excluded. Context stops at the invoking assistant message.

With `native` selected, agents receive `codex-search` and `codex-research` as direct
tools. Research supports batched search, page opening, page text lookup,
numbered link traversal, image and literature search, PDF screenshots, finance,
weather, sports and time. Availability of specialized queries depends on the
configured backend and model. Backend references use `openchamber_<sessionID>` and
remain isolated across OpenCode sessions. Results retain reference IDs for tool
continuation and use Markdown links for citations. Original backend output,
including page line numbers and source word limits, accompanies the results.

Both tools accept `mode` (`cached`, `indexed`, `live`), `search_context_size`,
`user_location` (country, region, city, timezone), `allowed_domains`,
`blocked_domains` and `max_output_tokens`. The same fields in the OpenCode
plugin entry's `options` define defaults; explicit tool arguments take
precedence. The response budget defaults to 10000 tokens. An unspecified search
mode uses the backend default. Settings and budget are sent to `/alpha/search`;
they are separate from `response_length` and OpenCode's own tool-output limits.
`mode` controls `settings.external_web_access`: cached is false, live is true,
and indexed is `"indexed"`. These tools use the direct caller setting.

The tool description includes Codex's browsing and citation rules. Structured
image/PDF presentation belongs to the client; this module currently returns
the backend's textual output and normalized source metadata.

Both tools use the `websearch` permission and check provider availability before
execution. Search disabled in settings or a provider policy also disables these
tools. Other selected search providers use OpenCode's `websearch` tool. The
managed config disables the external `opencode-websearch` plugin so exactly one
plugin registers `native`; the user's global plugin configuration is untouched.

This registration applies to OpenChamber-managed OpenCode instances: local web
and desktop servers, including mobile clients connected to them. External
OpenCode servers and VS Code connections manage their own plugins.

## Build and validation

`bun run build:server` checks the TypeScript and bundles the plugin and its
dependencies into `dist/plugin.js`. Development server startup watches this
bundle's sources. Package and desktop builds invoke the same build command.
Generated files are ignored by Git.

`runtime.test.js` loads the materialized bundle against an HTTP fixture and
checks reference continuity, credential routing, permissions and search
selection. `provider.test.js` checks malformed responses, error redaction,
cancellation and deadlines. `upstream-tests` retains protocol, normalization
and output tests from the source project, using Vitest and Markdown output.
