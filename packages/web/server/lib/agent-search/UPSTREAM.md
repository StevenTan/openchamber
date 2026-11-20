# Source attribution

The search contract follows [OpenAI Codex](https://github.com/openai/codex),
licensed under Apache-2.0; its license is in `codex-LICENSE`.

- `src/commands.ts` adapts the supported command definitions and descriptions
  from `codex-rs/codex-api/src/search.rs` into Zod schemas. The supported catalog
  is search, images, page opening, links, text lookup, finance and time.
- `src/web_run_description.ts` copies
  `codex-rs/ext/web-search/web_run_description.md`, restricted to that catalog.
- `src/request.ts` adapts conversation selection from
  `codex-rs/ext/web-search/src/history.rs` and
  `codex-rs/tools/src/response_history.rs`. It uses the Codex-derived UTF-8
  truncation helper in `agent-command/src/output.ts`.
- Request retry policy follows `codex-rs/model-provider-info/src/lib.rs`,
  `codex-rs/codex-client/src/retry.rs` and
  `codex-rs/http-client/src/retry_after.rs`.
- Model text and structured client results follow
  `codex-rs/ext/web-search/src/tool.rs` and `src/output.rs`.

OpenChamber owns the TypeScript HTTP boundary, OpenCode registration,
credential routing, permissions and runtime configuration.
