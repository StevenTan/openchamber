# Agent backends

`runtime.ts` owns Antigravity session records, active turns and permission requests.
`acp.ts` connects the official ACP client SDK to the bundled Antigravity CLI process.
The CLI implements authentication, model execution, tools and native session
restoration. `routes.ts` exposes the OpenChamber session operations under
`/api/agent-backends`. Enterprise mode blocks external-agent creation and prompts.
`server-frame/control-events-runtime.js` composes the control SSE broadcaster,
backend route registration and backend process shutdown.

Session records live in `<dataDir>/agent-backends/antigravity/`. Each record retains
the native Antigravity session ID and the message history displayed by OpenChamber.
Continuing after a server restart uses ACP `session/load`. Text, thoughts,
tool calls, file diffs and permissions travel over the existing control SSE
channel as `openchamber:agent-backend` events. Permission answers use the option
IDs supplied by Antigravity.

The UI adapter projects these records and events into the shared session and
message model. Web, Electron, hosted mobile and Capacitor use their connected
OpenChamber server. VS Code keeps its OpenCode connection. This integration
accepts text and text context; OpenChamber-specific agents, tools, goals,
attachments, forks and revert operations belong to the OpenCode backend.

Antigravity reuses its cached login. Run `agy acp --login` with the staged binary
to sign in. When `GEMINI_API_KEY` is configured, the ACP client authenticates
with `gemini-api-key` before creating or restoring a session.
The desktop ships the pinned official executable; development resolves the
staged Electron resource. A standalone server can use
`OPENCHAMBER_BUNDLED_ANTIGRAVITY_DIR` to select the directory containing `agy`
(`agy.exe` on Windows). The bundled process runs with automatic updates and
telemetry disabled.
