# Obol

Obol is a local-first macOS menu-bar widget and dashboard for estimated AI coding-agent spend.

[![CI](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml/badge.svg)](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## What it is

Obol keeps one local daemon as the source of truth for the native menu-bar widget and the Vite dashboard. It watches supported agent log directories, asks ccusage for offline estimates, stores the last good snapshot in ~/.obol, and serves the dashboard over a loopback-only HTTP endpoint.

The dashboard includes Today, history charts, provider and model breakdowns, Claude project history, budget settings, and CSV/JSON export. The menu-bar popover stays intentionally small: today’s total, provider split, a budget signal, and settings.

## Install

Download the latest DMG from [GitHub Releases](https://github.com/aakritsubedi/obol/releases), open it, and drag Obol to Applications. The public build is ad-hoc signed because this is a free open-source project without a 99 USD/year Apple Developer account. macOS therefore asks for a right-click → Open on the first launch after a download. That prompt is expected; it is not an Obol permission request.

The app needs Node.js 20 or newer. Obol checks /opt/homebrew/bin/node, /usr/local/bin/node, /opt/local/bin/node, /usr/bin/node, and ~/.volta/bin/node, then picks the newest interpreter from nvm (~/.nvm), mise, and fnm install folders.

Finder launches do not inherit your shell PATH, so if Node works in your terminal but none of those paths exist, link it once:

    sudo ln -s "$(which node)" /usr/local/bin/node

Use a real path and remove an existing conflicting symlink first. When the popover reports that Node is missing or that the daemon exited, the daemon's own output is in ~/.obol/daemon.log. The daemon runs ccusage with --offline, and your usage data stays on this Mac.

## Requirements

- macOS 13 or later
- Node.js 20 or later at a system-visible path
- Xcode 16 or later only when building from source

## Updating

When a stable GitHub Release is available, Obol checks once after launch, when the popover opens, and every six hours. Automatic checks are quiet: there is no notification, modal, or dock bounce. A pending release adds a small dot to Settings.

The Settings row can download, verify, and install the ZIP release. The updater checks the size, a SHA-256 digest or SHA256SUMS, the bundle identifier, the version, and the internal code signature before stopping the daemon and swapping the app. The replaced app is relaunched automatically. A release without a checksum is refused.

The DMG remains the manual install path. Verify its paired artifacts with:

    cd dist
    shasum -c SHA256SUMS

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

Merging to main is enough. The release workflow bumps the patch version, commits `chore(release): vX.Y.Z`, tags it, builds the universal DMG, ZIP, and checksums on GitHub Actions, and publishes a GitHub Release. Put `[minor]` or `[major]` in the merge commit subject to bump 0.2.0-style instead. Pushing a `v*` tag manually releases that exact version without a bump, and a manual workflow run with dry_run enabled only uploads build artifacts.

The public build stays ad-hoc signed; adding `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PASSWORD`, `MACOS_SIGN_IDENTITY`, `AC_API_KEY_ID`, `AC_API_ISSUER`, and `AC_API_KEY` secrets switches the same workflow to Developer ID signing and notarization.

## Architecture

    macOS menu-bar app
          │ loopback HTTP + per-process token
          ▼
    Node daemon ── offline ccusage ── local agent logs
          │
          └── Vite dashboard

The daemon binds to 127.0.0.1 and records its ephemeral-or-default port and token in ~/.obol/runtime.json. The dashboard proxies /api to that daemon in development.

## Privacy and estimates

Obol has no telemetry. The daemon is loopback-only, ccusage runs offline, and snapshots/configuration remain under ~/.obol. Costs are estimates from ccusage’s pricing table, not invoices. The app does not upload agent logs or usage snapshots.

Obol packages and credits [ccusage](https://github.com/ryoppippi/ccusage) prominently; its license and upstream behavior remain part of the dependency you install.

## Contributing and license

See CONTRIBUTING.md for prerequisites, checks, and commit conventions. See SECURITY.md for the local boundary and updater trust model. Obol is available under the MIT License; see LICENSE.
