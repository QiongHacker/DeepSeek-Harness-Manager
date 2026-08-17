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
| `DSH-Manager-1.0.0-windows-x64.zip` | **Recommended. Faster startup.** | Extract once, then run `DSH Manager.exe` from the extracted folder. Keep all extracted files together. |
| `DSH-Manager-1.0.0-portable.exe` | Single-file portability | Run the EXE directly. It needs no installation, but starts more slowly because the embedded Electron runtime is extracted to a temporary folder on every launch. |

The application is currently unsigned. Windows SmartScreen may show a warning on first launch; verify the release checksum before choosing **Run anyway**.

## What it does

| Area | Capabilities |
| --- | --- |
| Existing Harness binding | Select an existing DeepSeek Harness source checkout, validate its structure, and immediately manage its version and process state. Ordinary Node.js folders are rejected. |
| One-click deployment | Clone the Harness repository, keep the pnpm store inside the deployment directory, install dependencies, and start the web profile. |
| Process management | Start `pnpm dsh web`, detect an already-running instance on port `3080`, stop manager-owned or confirmed external instances, and open the web UI. |
| Version management | Read the package version and Git commit, discover the actual upstream branch, compare local/remote commits, fast-forward safely, reinstall changed dependencies, and restart when needed. |
| API binding | Save a DeepSeek or OpenAI-compatible endpoint and API key to the official Harness files under `~/.dsh`. |
| Token statistics | Aggregate plain and zstd-compressed session logs, including token categories, cache hit rate, model totals, and estimated cost. |
| Plugin management | List installed plugins, install pnpm-compatible package/Git specs, and remove plugins for the selected profile. |
| Modern interface | DeepSeek-inspired light/dark themes, Chinese/English switching, persistent preferences, and a responsive layout down to `680 × 520`. |

## Requirements

- Windows 10 or Windows 11, x64.
- Git available on `PATH` for deployment and version updates.
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

To switch to another checkout, stop the currently managed Harness first, then use **Settings → Harness directory → Choose folder**.

## Storage and configuration

- Manager preferences are stored in Electron's per-user application data directory.
- Harness settings and credentials are written to `~/.dsh/settings.yaml` and `~/.dsh/.credentials.yaml`.
- Session statistics are read from `~/.dsh/sessions`.
- A manager-created deployment keeps `node_modules`, `.pnpm-store`, and its generated `.npmrc` inside the selected deployment directory.
- Closing DSH Manager does not stop Harness; the service can continue running in the background.

The default checkout path is `%USERPROFILE%\deepseek-harness`, but it can be replaced by binding any valid checkout in the interface or by setting `DSH_CHECKOUT`.

## Network fallback

- The primary source is `https://github.com/deepseek-ai/deepseek-harness.git`.
- If cloning fails, the configured Git mirror is tried automatically.
- If dependency installation fails, the manager retries with `https://registry.npmmirror.com`.
- Update checks follow the bound repository's actual upstream branch instead of assuming `master` or `main`.

## Repository layout

The source repository intentionally does **not** contain generated packages. `dist/` is ignored; release binaries are attached to GitHub Releases.

```text
DeepSeek-Harness-Manager/
├─ .gitattributes               Cross-platform text normalization
├─ .github/
│  ├─ release-notes/
│  │  └─ v1.0.0.md             Bilingual notes for the first release
│  └─ workflows/
│     └─ release.yml           Windows validation, build and release automation
├─ .gitignore                   Generated/runtime file exclusions
├─ build/
│  ├─ icon.ico                 Windows application icon
│  └─ icon.png                 README/source icon
├─ core/
│  ├─ service.js               Harness process, deployment, Git, API and plugin services
│  ├─ service.test.js          End-to-end core tests with temporary repositories/services
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
│  └─ render-icon.js           Electron icon renderer
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
├─ DSH-Manager-1.0.0-portable.exe
├─ DSH-Manager-1.0.0-windows-x64.zip
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
```

`pnpm test` covers existing-checkout binding and rejection, start/stop, external port detection, upstream update checks, fast-forward updates, deployment/redeployment, mirror fallback, API persistence, token statistics, plugins, and service-layer localization. Electron smoke tests additionally check navigation, themes, language switching, responsive layout, and renderer errors.

## Troubleshooting

### The portable EXE starts slowly

The portable target is an NSIS self-extracting executable. It removes and recreates a temporary application directory, extracts the complete Electron runtime, starts the app, and removes that directory after exit. Antivirus scanning can add more delay. Use the complete ZIP build for normal daily use: extract it once and run `DSH Manager.exe` directly.

### Version updates are unavailable after binding

The selected folder can still be started if it is a valid Harness source archive, but version comparison and fast-forward updates require a Git checkout with an `origin` remote/upstream branch.

### Harness does not start

Run **Environment check** on the Overview page and inspect **Runtime Logs**. Confirm the selected directory is the Harness repository root and that Git, Node.js, and pnpm meet the requirements above.

## License

[MIT](LICENSE) © QiongHacker
