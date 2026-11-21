# Antigravity CLI

`release.json` pins the official native CLI archives and their published SHA-512
checksums. `scripts/prepare-antigravity.mjs` downloads the build target into
`.cache/antigravity` and stages `agy` (`agy.exe` on Windows) in
`resources/antigravity`. Electron packages that directory as an extra resource.

The Web ACP adapter starts this executable with `acp --disable-telemetry` and
`AGY_CLI_DISABLE_AUTO_UPDATE=1`. Authentication and native session data belong to
Antigravity's user profile. `agy acp --login` signs in before starting sessions.
