# Managed web search

## Ownership

This module registers `web.run` and the `native` search provider in managed
OpenCode instances. OpenCode flattens the direct tool name to `web_run`.
`runtime.js` publishes the bundled plugin in the managed instance directory.
`UPSTREAM.md` identifies the official protocol and tool-description sources.

Web and Electron inject the plugin. Hosted and Capacitor clients use their
connected server's plugin. External OpenCode and VS Code own their plugins.

## Invariants

- Queries support `search_query`, `image_query`, `open`, `click`, `find`,
  `finance`, `time`, and `response_length`. A mixed query is one request.
  An omitted response length stays omitted, and query text stays unchanged.
- The backend's `output` is the model-facing text, including its whitespace,
  references, source limits and citation markers. Structured `results` stay
  opaque in tool metadata. They may contain future result variants.
- Image search produces text and metadata. Image URLs in search text are
  source data; the plugin does not emit file content items.
- Direct calls use the invoking assistant's model and the provider's current
  credentials and headers. Model `baseURL` takes precedence over provider
  `baseURL`; requests use `<baseURL>/alpha/search`.
- Backend references use `openchamber_<sessionID>`. Sessions cannot share
  search reference state. The native provider API has no session context and
  uses a fresh identifier and the default model for each call.
- Conversation input contains the last two user texts and intervening assistant
  text, with a shared approximate 1000-token assistant budget. Tool results,
  reasoning and media are outside this search context.
- OpenCode search selection, provider policy and `websearch` permissions govern
  access. With `native` selected, model requests expose `web_run`; other search
  selections use OpenCode's built-in `websearch`.
- Plugin options own runtime settings: `web_search` (`cached`, `indexed` or `live`,
  default `cached`),
  `web_search_config` (`user_location`, `search_context_size`,
  `filters.allowed_domains`), and `tool_output_token_limit` (default 10000).
  These fields are not query arguments. Search selection controls disabling.
- Failed HTTP requests and malformed response envelopes fail the tool.
  Credentials are redacted from HTTP error text. The invocation signal and
  an explicitly configured provider timeout govern each attempt. Server errors
  (5xx), connection failures and attempt timeouts allow four retries with
  200 ms exponential backoff and 0.9–1.1 jitter. `Retry-After` supplies the
  retry deadline when present. Cancellation stops requests and backoff waits.
  Other HTTP errors and invalid response data fail immediately. Retries keep
  the same request body within the tool call; OpenCode owns subsequent model
  behavior.

## Decisions

### Why output and display data have separate owners

The model consumes backend text while clients consume structured metadata.
Keeping both channels preserves references and forward-compatible result
variants without adding display text or media to model input.

### Why the output budget belongs to plugin configuration

OpenCode's public tool context does not expose Codex's per-invocation
`TruncationPolicy`. `tool_output_token_limit` supplies the backend budget;
OpenCode independently applies its normal tool-output limits afterward.

## Validation

`bun run build:server` checks TypeScript and bundles `src/plugin.ts` into
`dist/plugin.js`. Tests load the materialized bundle and exercise its HTTP
boundary, catalog, permissions, session references and raw output contract.
Live verification uses an isolated OpenCode instance and inspects the next
model request as well as the stored tool result.
