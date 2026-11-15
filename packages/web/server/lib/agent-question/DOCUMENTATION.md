# Asynchronous questions

Managed OpenCode exposes `request_user_input_async` with one or more questions,
each carrying `title` and optional string `options`. Every field accepts free
text; the first option is selected initially and requires explicit submission.
The tool returns a question ID without waiting for the user. OpenCode's native
forms render the question in the shared composer dock.

The UI groups pending asynchronous requests by their owning session. Fields retain
their request IDs, answers stay in the client draft while the user switches
questions, and Submit sends the entire displayed group. A request arriving after
submission remains pending for its own user submission.

`src/runtime.ts` owns the pending questions and answer delivery. It persists
entries atomically to `<data-dir>/async-questions/<server-identity>/async-questions.json`, with serialized mutations
and owner-readable permissions. A missing file starts empty; a malformed or
unreadable file rejects writes so pending work cannot be overwritten.

The runtime, binding address and configured listener port identify the owning server across
restarts. Servers sharing a data folder use separate files, so a desktop process
and web or development servers cannot overwrite or recreate each other's forms.
Recovery uses the same runtime, binding address and configured port that created the question.
With an automatically allocated port (`0`), the namespace belongs to the server
process; recovery covers OpenCode child restarts within that process.

`POST /api/openchamber/async-question/resolve` validates every member of a group
before atomically saving all replies under one delivery message ID. Reconciliation
settles the native forms and injects one message containing every request ID and
answer. A grouped dismissal uses the same delivery contract. A failed validation
or write leaves every member pending. Retries and process restarts retain the
group's shared message ID.

The existing form reply and cancellation endpoints settle individual questions through
this runtime before returning success. The answer is durable before the native
form is settled. Other forms continue through the normal OpenCode proxy. Native
form events also reconcile answers received outside this server's routes.

Answers and cancellations arrive as synthetic messages in the original session,
with the question ID and the original questions. `delivery: steer` makes a running
session read the response at its next boundary. An idle session wakes; an archived
session records the response without starting work. A stable, persisted message
ID prevents duplicate admission after a lost response or restart.

On startup and event-stream reconnect, the runtime reads pending native forms and
recreates any lost with OpenCode's in-memory form cache. Failed operations retry
every two seconds until they succeed; errors are logged. Missing sessions release
their entries. Shutdown stops subscriptions and drains the current mutation.

The form metadata kind `openchamber-async-question` distinguishes these requests
from blocking forms; its persisted `order` places unanswered questions in request
order across refreshes and restarts. Shared UI keeps them visible while the agent works and
preserves them when the user sends another message. They do not mark the agent as
blocked or enter the host's blocking-request index.

Web and Electron managed runtimes inject the plugin automatically. Hosted and
Capacitor clients use the connected server's plugin. External OpenCode and VS Code
lifecycles do not inject it. No synchronous question tool is added.
