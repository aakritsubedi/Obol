# Obol

Obol is a local-first macOS menu-bar widget and dashboard for estimated AI coding-agent spend.

[![CI](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml/badge.svg)](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## What it is

Obol keeps one local daemon as the source of truth for the native menu-bar widget and the Vite dashboard. It watches supported agent log directories, asks ccusage for offline estimates, stores the last good snapshot in ~/.obol, and serves the dashboard over a loopback-only HTTP endpoint.

The dashboard includes Today, history charts, provider and model breakdowns, Claude project history, budget settings, and CSV/JSON export. The menu-bar popover stays intentionally small: today’s total, provider split, a budget signal, and settings.

## Install

Download the latest DMG from [GitHub Releases](https://github.com/aakritsubedi/obol/releases), open it, and drag Obol to Applications. The public build is ad-hoc signed because this is a free open-source project without a 99 USD/year Apple Developer account. macOS therefore asks for a right-click → Open on the first launch after a download. That prompt is expected; it is not an Obol permission request.

The app needs Node.js 20 or newer at one of these paths:

- /opt/homebrew/bin/node
- /usr/local/bin/node
- /usr/bin/node

Obol is launched by Finder, so it does not inherit an nvm or shell PATH. If Node works in your terminal but Obol says the daemon could not start, check which node and install a system-visible path. One workaround is:

    sudo ln -s "$(which node)" /usr/local/bin/node

Use a real path and remove an existing conflicting symlink first. The daemon runs ccusage with --offline, and your usage data stays on this Mac.

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

The first in-app update is v0.2.0 → v0.2.1; users on 0.1.0 should install the v0.2.0 DMG manually.

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
