# Workspace dependencies

## Ownership

Owns the versioned Python PDF environment, its read-only locator tool and the
managed `pdf` skill. Command execution belongs to `agent-command`; PNG inspection
uses `view_image` and the native image attachment pipeline. The runtime contains pypdf, pdfplumber,
reportlab and their locked dependencies, plus Poppler's `pdftoppm` and `pdfinfo`.

## Invariants

- Runtime files are separate from user projects and the system Python. The
  locator returns absolute paths and versions from `runtime.json`; it performs
  no downloads or package installation. The skill runs Python in isolated mode.
- Executable runtime files live in the writable user cache at
  `~/.cache/openchamber-runtimes/<platform>-<arch>/<fingerprint>/openchamber-primary-runtime`.
  Python uses its normal bytecode cache behavior. App resources contain only
  the compressed runtime and its SHA256 manifest.
- Preparation verifies Python and Poppler artifact SHA256 hashes and installs
  hash-locked Python wheels into a staging directory. The published runtime changes
  only after preparation succeeds; a failed replacement restores the previous
  directory. Build caches and prepared binaries are generated assets.
- Electron supplies the payload directory; managed process setup verifies its
  digest, extracts into a sibling staging directory, validates the runtime and
  atomically publishes it. Repeated setup reuses the installed version. Concurrent
  processes can publish the same bundle; each cleans up its own staging directory.
  Distinct versions have distinct roots, so a failed install or an app update
  leaves running processes' files intact. Older cache versions remain available.
- Web servers prepare the same cache layout with `prepare:workspace-runtime`.
  `OPENCHAMBER_WORKSPACE_RUNTIME_DIR` selects an explicitly prepared environment.
  Installation failures are logged and the locator reports unavailable files;
  other managed tools remain usable. System Python is not selected implicitly.
- Managed Web and Electron receive the tool and skill. Hosted and Capacitor
  clients use the connected server's environment. External OpenCode and VS Code
  retain their own process and skill configuration.
- Python archives and wheel tags cover macOS 13+, glibc 2.28+ Linux and Windows
  on x64 and arm64. Windows arm64 uses the x64 interpreter through Windows
  emulation. Cross-architecture preparation installs target wheels using the host
  interpreter; executing the target runtime is validated on native builds.
- The locator returns absolute Poppler launcher paths. Each launcher supplies
  the bundled font configuration; font discovery includes the runtime's
  ReportLab fonts and platform font directories. Neither the launchers nor the
  font configuration contains the staging or installed application path.

## Decisions

### Why a standalone interpreter and versioned manifest

Python, its libraries and native PDF renderer move together. A project virtual
environment or the system interpreter can change independently and cannot
provide the same known environment to every managed project.

### Why a self-contained Poppler build

The PDF skill uses `pdftoppm` and `pdfinfo`. The pinned `unpins/poppler-utils`
distribution embeds the encoding tables and native libraries so these commands
remain usable after the application moves. It supports PNG rendering and PDF
information queries; TIFF output and signature backends are outside this build.
`pypdfium2` remains a transitive dependency of `pdfplumber`.

### Why a compressed payload and immutable cache directories

The application carries a verified runtime archive for offline first startup.
Executable files and Python caches belong to the user cache rather than signed
application resources. Fingerprint-specific roots allow app versions and active
processes to use their own environment without replacing files in use.

### Why Windows arm64 uses x64 Python

The locked cryptography dependency provides Windows x64 wheels. Windows' x64
emulation runs the interpreter and its native wheels as one architecture.
