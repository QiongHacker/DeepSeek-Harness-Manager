<div align="center">
  <img src="build/icon.png" width="96" alt="DSH Manager icon" />
  <h1>DeepSeek Harness Manager</h1>
  <p>A modern Windows desktop manager for DeepSeek Harness.</p>

  [English](README.md) · [简体中文](README.zh-CN.md)

  [![Release](https://img.shields.io/github/v/release/QiongHacker/DeepSeek-Harness-Manager?display_name=tag)](https://github.com/QiongHacker/DeepSeek-Harness-Manager/releases/latest)
  [![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-4D6BFE)](https://github.com/QiongHacker/DeepSeek-Harness-Manager/releases/latest)
  [![License](https://img.shields.io/github/license/QiongHacker/DeepSeek-Harness-Manager)](LICENSE)
</div>

> This is a community desktop manager. DeepSeek Harness itself remains governed by its own repository and license.

## Download

Download both builds from the [latest GitHub Release](https://github.com/QiongHacker/DeepSeek-Harness-Manager/releases/latest).

| Package | Recommended for | Usage |
| --- | --- | --- |
| `DSH-Manager-*-windows-x64.zip` | **Recommended. Faster startup.** | Extract once, then run `DSH Manager.exe` from the extracted folder. Keep all extracted files together. |
| `DSH-Manager-*-portable.exe` | Single-file portability | Run the EXE directly. It needs no installation, but starts more slowly because the embedded Electron runtime is extracted to a temporary folder on every launch. |

The application is currently unsigned. Windows SmartScreen may show a warning on first launch; verify the release checksum before choosing **Run anyway**.

## What it does

| Area | Capabilities |
| --- | --- |
| Existing Harness binding | Select an existing DeepSeek Harness source checkout, validate its structure, and immediately manage its version and process state. Ordinary Node.js folders are rejected. |
| One-click deployment | Clone the Harness repository, keep the pnpm store inside the deployment directory, install dependencies, and start the web profile. |
| Process management | Start `pnpm dsh web`, detect an already-running instance on port `3080`, stop manager-owned or confirmed external instances, and open the web UI. |
| Version management | Load upstream tags and recent commits, select an exact version manually, switch safely, and roll back previous switches. Tracked source changes block switching; changed dependencies are reinstalled and failed switches restore the original commit. |
| API binding | Save a DeepSeek or OpenAI-compatible endpoint and API key to the official Harness files under `~/.dsh`. |
| Token statistics | Incrementally aggregate plain and zstd-compressed session logs with live progress, monthly/daily/hourly usage bar charts, token categories, cache hit rate, model totals, and estimated cost. Unchanged history is reused from a persistent cache. |
| Plugin management | List installed plugins, install validated pnpm-compatible package/Git specs, and remove plugins for the selected profile. Plugins are executable code, so install only reviewed sources you trust. |
| Environment migration | Export either an environment-only archive or a complete extract-and-run ZIP containing DSH Manager. The bundled launcher binds its relative Harness environment automatically and installs missing dependencies on first start. |
| Clean removal | Remove manager settings/caches and optionally delete the Harness user-data and bound source directories after a native final review. Portable application files remain under the user's control. |
| Modern interface | DeepSeek-inspired light/dark themes, Chinese/English switching, persistent preferences, and a responsive layout down to `680 × 520`. |

## Requirements

- Windows 10 or Windows 11, x64.
- Git available on `PATH` for deployment and version management.
- Node.js `^22.19.0` or `>=24.0.0`.
- pnpm available on `PATH`.
- Network access for a new deployment, dependency installation, plugin installation, and remote update checks.

If Harness already exists on the computer, select its **repository root**—the folder containing its root `package.json` and pnpm workspace files.

## Quick start

1. Download the recommended ZIP build and extract it, or download the single portable EXE.
2. Start DSH Manager.
3. Choose one of the following on the Overview page:
   - **Bind existing Harness** and select an existing source checkout.
   - **Download & deploy** to create a fresh checkout.
4. Open **Settings → API Binding** and save the endpoint/API key if it is not already configured.
5. Select **Start**, then **Open web app**.

Open **Version Manager** to refresh the remote catalog. Choose **Upstream latest**, a release tag, or a recent commit, then select **Switch to selected**. The manager records successful switches locally so **Roll back previous** can step back through earlier versions. A running Harness is stopped and restarted automatically.

To switch to another checkout, stop the currently managed Harness first, then use **Settings → Harness directory → Choose folder**.

To move the environment to another computer, open **Settings → Migration & Removal**:

- **Export with launcher** creates a complete ZIP. Extract it on the destination computer, run `DSH Manager.exe`, then select **Start**. The included environment is bound automatically; missing checkout/profile dependencies are installed on the first start.
- **Environment only** creates the smaller migration archive used by **Import & bind**. Import creates `deepseek-harness` and `.dsh` under the selected parent folder and installs dependencies from the included lockfile.

Both formats exclude the API key. Launcher bundles also omit the machine-local `settings.yaml`; enter API settings again after migration. The first start of an exported launcher bundle requires Node.js, pnpm, and network access when dependencies are not already installed.

## Storage and configuration

- Manager preferences are stored in Electron's per-user application data directory.
- Harness settings and credentials are written to `~/.dsh/settings.yaml` and `~/.dsh/.credentials.yaml`.
- Session statistics are read from `~/.dsh/sessions`.
- Per-session usage summaries are cached beside the manager configuration; unchanged history is not reparsed on every refresh.
- Successful Harness version switches are recorded in `version-history.json` beside the manager configuration. This history contains only checkout paths, commit IDs, versions, and timestamps.
- A manager-created deployment keeps `node_modules`, `.pnpm-store`, and its generated `.npmrc` inside the selected deployment directory.
- Closing DSH Manager does not stop Harness; the service can continue running in the background.
- Migration packages—including launcher bundles—deliberately omit credentials, session history, logs, Git metadata, installed dependencies, pnpm caches, `.env` files, and `.npmrc`. They are intended for environment setup, not session backup.

The default checkout path is `%USERPROFILE%\deepseek-harness`, but it can be replaced by binding any valid checkout in the interface or by setting `DSH_CHECKOUT`.

## Security and API keys

- The renderer runs on an allowlisted `app://` protocol with Chromium sandboxing, context isolation, no Node.js integration, a restrictive Content Security Policy, blocked navigation/windows/permissions, and an allowlisted preload bridge.
- Every IPC request is accepted only from the manager's main local frame. External links and configurable endpoints are protocol-validated; persisted settings cannot override process commands or the official deployment source.
- API keys are never returned to the renderer after saving. Only a suffix mask is shown, and known/token-shaped secrets are redacted from logs.
- Migration export strips sensitive YAML fields and excludes files containing the configured key or common token formats. Import tests the ZIP, rejects unexpected/symbolic paths, and verifies the declared size and SHA-256 digest of every payload file before copying it.
- Manager preferences never store API keys. Harness compatibility currently requires the key in `~/.dsh/settings.yaml` and `~/.dsh/.credentials.yaml`; these per-user files are excluded from every build.
- Release builds enable Electron fuses and ASAR integrity restrictions. CI audits dependencies, scans source and complete Git history, builds the packages, then extracts and scans the ZIP/portable EXE before publishing. The scanner detects common credential formats; when run on the development computer it also checks exact matches against locally configured keys without printing their value.

Run the same checks locally with `pnpm run security:audit` and `pnpm audit --prod --audit-level high`.

No desktop application can protect a plaintext Harness credential from malware or an administrator already running as the same Windows user. If the computer may be compromised, revoke the key in the DeepSeek platform and issue a new one. Third-party plugins and custom API endpoints are also trusted-code/network boundaries: a plugin can read Harness files, and an endpoint receives the supplied key.

## Network fallback

- The primary source is `https://github.com/deepseek-ai/deepseek-harness.git`.
- No third-party Git mirror is enabled by default. If cloning fails, a user-configured HTTPS mirror is tried automatically.
- If dependency installation fails, the manager retries with `https://registry.npmmirror.com`.
- Version discovery follows the bound repository's actual upstream branch instead of assuming `master` or `main`, and combines release tags with recent upstream commits.

## Repository layout

The source repository intentionally does **not** contain generated packages. `dist/` is ignored; release binaries are attached to GitHub Releases.

```text
DeepSeek-Harness-Manager/
├─ .gitattributes               Cross-platform text normalization
├─ .github/
│  ├─ release-notes/
│  │  ├─ v1.0.0.md             Bilingual notes for the first release
│  │  ├─ v1.1.0.md             v1.1 bilingual release notes
│  │  ├─ v1.2.0.md             v1.2 bilingual release notes
│  │  └─ v1.3.0.md             Current bilingual release notes
│  └─ workflows/
│     └─ release.yml           Windows validation, build and release automation
├─ .gitignore                   Generated/runtime file exclusions
├─ build/
│  ├─ icon.ico                 Windows application icon
│  └─ icon.png                 README/source icon
├─ core/
│  ├─ service.js               Harness process, deployment, Git, API and plugin services
│  ├─ service.test.js          End-to-end core tests with temporary repositories/services
│  ├─ migration.js             Credential-free export/import, archive validation and integrity checks
│  ├─ security.js              URL, IPC payload, config and secret-redaction policy
│  ├─ stats.js                 Session aggregation and cost estimation
│  └─ stats-worker.js          Background statistics worker
├─ renderer/
│  ├─ index.html               Application markup
│  ├─ renderer.js              UI state, localization and interactions
│  ├─ styles.css               Responsive DeepSeek light/dark themes
│  └─ logo.svg                 DeepSeek-style fish mark used in the app
├─ scripts/
│  ├─ make-ico.mjs             ICO generator
│  ├─ make-icon.ps1            Icon helper for Windows
│  ├─ after-pack.mjs           Strict Electron fuse policy applied before signing
│  ├─ render-icon.js           Electron icon renderer
│  └─ security-audit.js        Source/history/release credential scanner
├─ main.js                     Electron main process, IPC and diagnostic entry points
├─ preload.js                  Context-isolated renderer bridge
├─ package.json                Scripts, dependencies and dual Windows build config
├─ pnpm-lock.yaml              Locked JavaScript dependencies
├─ pnpm-workspace.yaml         pnpm workspace declaration
├─ README.md                   English documentation (default)
├─ README.zh-CN.md             Simplified Chinese documentation
└─ LICENSE                     MIT license
```

Generated locally, but excluded from Git:

```text
dist/
├─ DSH-Manager-1.3.0-portable.exe
├─ DSH-Manager-1.3.0-windows-x64.zip
└─ win-unpacked/               Temporary/full build directory
```

## Development

```powershell
pnpm install
pnpm test
pnpm start
```

Build commands:

```powershell
pnpm run dist            # Build both portable EXE and complete ZIP
pnpm run dist:portable   # Build only the single-file portable EXE
pnpm run dist:zip        # Build only the extract-once ZIP
pnpm run pack            # Build the unpacked Windows directory
pnpm run icon            # Regenerate icon.png and icon.ico
pnpm run security:audit  # Scan source, Git history and extracted release artifacts
```

`pnpm test` covers security input policy, config/key isolation, log redaction, credential-free migration, archive restoration, safe cleanup scope, version discovery, exact-version switching, rollback, and dirty-worktree protection in addition to existing-checkout binding and rejection, start/stop, external port detection, deployment/redeployment, mirror fallback, API persistence, token statistics, plugins, and service-layer localization. Electron smoke tests additionally check the Version Manager controls, navigation, themes, language switching, responsive layout, and renderer errors.

## Troubleshooting

### The portable EXE starts slowly

The portable target is an NSIS self-extracting executable. It removes and recreates a temporary application directory, extracts the complete Electron runtime, starts the app, and removes that directory after exit. Antivirus scanning can add more delay. Use the complete ZIP build for normal daily use: extract it once and run `DSH Manager.exe` directly.

### Version management is unavailable after binding

The selected folder can still be started if it is a valid Harness source archive, but version discovery, switching, and rollback require a Git checkout with an `origin` remote/upstream branch. Switching is intentionally blocked when tracked files contain uncommitted changes.

### Harness does not start

Run **Environment check** on the Overview page and inspect **Runtime Logs**. Confirm the selected directory is the Harness repository root and that Git, Node.js, and pnpm meet the requirements above.

### Migration import says the destination is not empty

Choose a parent folder that does not already contain non-empty `deepseek-harness` or `.dsh` children. The manager never merges an import into existing environment data because that could overwrite credentials, sessions, or source changes.

### Clean removal leaves the application EXE or folder

This is intentional. Both release formats are portable and register no Windows installer. The cleanup command removes selected per-user data after the app exits; then delete the downloaded portable EXE or the extracted application folder manually. The manager never recursively deletes its containing folder because it may also contain unrelated user files.

## License

[MIT](LICENSE) © QiongHacker
