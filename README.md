<div align="center">

# Obol

**Know what your AI coding agents cost — from your menu bar.**

Live spend tracking for Claude Code, Codex CLI, and OpenCode.
Local-only. No telemetry. No accounts.

[![Download the latest DMG](https://img.shields.io/badge/Download-Obol.dmg-2ea44f?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/aakritsubedi/obol/releases/latest/download/Obol.dmg)

[All releases](https://github.com/aakritsubedi/obol/releases) · [Report an issue](https://github.com/aakritsubedi/obol/issues) · [Build from source](#build-from-source)

[![CI](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml/badge.svg)](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="docs/images/menu-bar.png" width="720" alt="Obol menu bar popover showing today's AI spend, a provider split between Claude, Codex, and Opencode, and a Live indicator">

</div>

## Why Obol

AI coding tools bill by the token, and the spend is invisible until the invoice lands. Obol puts today's number one click away:

- **Menu bar widget** — today's total in your menu bar at all times. Click for a compact popover: provider split with token counts, a live/cached indicator, and settings.
- **Full dashboard** — a local web dashboard with history charts (daily/weekly/monthly), per-provider and per-model breakdowns, Claude project history, weekly rollups, and CSV/JSON export.
- **Budgets that speak up** — set a daily budget and Obol shifts its status color as you approach it, with native notifications when thresholds are crossed.
- **Private by design** — everything runs on your Mac. The daemon reads local agent logs, estimates cost offline via [ccusage](https://github.com/ryoppippi/ccusage), and serves the dashboard on loopback only. No telemetry, no uploads, no accounts.
- **Self-updating** — Obol checks GitHub Releases quietly, verifies checksums and signatures, and installs updates without touching a terminal.

<div align="center">

<img src="docs/images/dashboard.png" width="860" alt="Obol dashboard showing today's spend, history totals, input and output tokens, and a daily spend-over-time chart with per-provider breakdown">

</div>

## Download

1. Grab [`Obol.dmg`](https://github.com/aakritsubedi/obol/releases/latest/download/Obol.dmg) — that link always fetches the newest release. Prefer browsing? Head to [Releases](https://github.com/aakritsubedi/obol/releases) and download the versioned DMG.
2. Open the DMG and drag **Obol** to **Applications**.
3. First launch: right-click the app → **Open** (once). The public build is ad-hoc signed — this is a free open-source project without a 99 USD/year Apple Developer account — so macOS asks for confirmation on the first launch after a download. That prompt is expected; it is not an Obol permission request.

### Requirements

- macOS 13 or later
- Node.js 20 or later, visible to Finder-launched apps

Obol checks `/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/opt/local/bin/node`, `/usr/bin/node`, and `~/.volta/bin/node`, then picks the newest interpreter from nvm (`~/.nvm`), mise, and fnm install folders.

Finder launches do not inherit your shell PATH, so if Node works in your terminal but none of those paths exist, link it once:

    sudo ln -s "$(which node)" /usr/local/bin/node

Use a real path and remove an existing conflicting symlink first. When the popover reports that Node is missing or that the daemon exited, the daemon's own output is in `~/.obol/daemon.log`.

## Updating

When a stable GitHub Release is available, Obol checks once after launch, when the popover opens, and every six hours. Automatic checks are quiet: there is no notification, modal, or dock bounce. A pending release adds a small dot to Settings.

The Settings row can download, verify, and install the ZIP release. The updater checks the size, a SHA-256 digest or SHA256SUMS, the bundle identifier, the version, and the internal code signature before stopping the daemon and swapping the app. The replaced app is relaunched automatically. A release without a checksum is refused.

The DMG remains the manual install path. Verify its paired artifacts with:

    cd dist
    shasum -c SHA256SUMS

## How it works

    macOS menu-bar app
          │ loopback HTTP + per-process token
          ▼
    Node daemon ── offline ccusage ── local agent logs
          │
          └── Vite dashboard

One local daemon is the source of truth for both the native widget and the dashboard. It watches supported agent log directories, asks ccusage for offline estimates, stores the last good snapshot in `~/.obol`, and serves the dashboard over a loopback-only HTTP endpoint with a per-process token.

Costs are estimates from ccusage's pricing table, not invoices. Obol has no telemetry: the daemon binds to 127.0.0.1, ccusage runs offline, and snapshots/configuration remain under `~/.obol`. The app does not upload agent logs or usage snapshots.

---

## Build from source

    npm ci
    npm run build
    npm run package:dmg

The package command writes `dist/Obol-VERSION.dmg`, `dist/Obol-VERSION.zip`, and `dist/SHA256SUMS`. The ZIP is the artifact consumed by the in-app updater; it comes from the same signed staging bundle as the DMG. See macos/README.md for universal builds, version stamping, and signing.

To run the pieces during development:

    npm run dev:daemon
    npm run dev:dashboard

For a one-shot daemon refresh:

    npm run once -w daemon

## Releasing

Merging to main is enough. The release workflow reads every commit since the previous tag and picks the bump level: a `BREAKING CHANGE` footer or `type!:` subject bumps the major version, any `feat:`/`feature:` subject bumps the minor version, everything else patches. `[major]` or `[minor]` in a subject forces a level. It then commits `chore(release): vX.Y.Z`, tags it, builds the universal DMG, ZIP, and checksums on GitHub Actions, and publishes a GitHub Release with the DMG attached for direct download. Release notes are drafted by GitHub Models (free inference with the workflow's own token) from those commits, and fall back to raw commit subjects if the model call fails. Pushing a `v*` tag manually releases that exact version without a bump, and a manual workflow run with dry_run enabled only uploads build artifacts.

The public build stays ad-hoc signed; adding `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PASSWORD`, `MACOS_SIGN_IDENTITY`, `AC_API_KEY_ID`, `AC_API_ISSUER`, and `AC_API_KEY` secrets switches the same workflow to Developer ID signing and notarization.

## Contributing and license

See CONTRIBUTING.md for prerequisites, checks, and commit conventions. See SECURITY.md for the local boundary and updater trust model. Obol packages and credits [ccusage](https://github.com/ryoppippi/ccusage) prominently; its license and upstream behavior remain part of the dependency you install. Obol is available under the MIT License; see LICENSE.
