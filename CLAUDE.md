# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Obol is a local-first macOS menu bar app + local dashboard that tracks token usage and estimated spend for AI coding agents (Claude Code, Codex CLI, OpenCode). It has three runtimes that share one contract:

- **daemon** (`daemon/`) — Node/TypeScript. The source of truth. Reads agent logs via `ccusage`, watches filesystem sources, serves HTTP + SSE on `127.0.0.1` only.
- **dashboard** (`dashboard/`) — React/TypeScript/Vite, served by the daemon.
- **macos** (`macos/`) — Swift/AppKit menu bar app; a native presenter over the same daemon API.
- **contract** (`contract/`) — shared TypeScript types (`type`-only exports) consumed by daemon and dashboard. The Swift side hand-writes matching decoding, checked against recorded JSON fixtures (see below).

## Commands

Root workspace commands operate across `contract`, `daemon`, `dashboard` (npm workspaces):

```sh
npm ci                        # install
npm run build                 # build all workspaces + bundle the daemon
npm run typecheck             # tsc --noEmit across workspaces
npm test                      # vitest across workspaces
npm run lint                  # biome check (contract/src daemon/src dashboard/src scripts)
npm run format                # biome format --write (same paths)
node scripts/check-boundaries.mjs     # enforce dashboard feature-import boundaries
npm run check-contract-fixtures       # contract/fixtures/*.json must match macos Swift fixtures
./scripts/check-version.sh --no-tag   # version consistency across package.json files + Xcode target
```

Per-workspace dev loops (start the daemon first so the dashboard can read its runtime token):

```sh
npm run dev:daemon        # tsx src/index.ts, terminal 1
npm run dev:dashboard     # vite, terminal 2
npm run once -w daemon    # one refresh, prints a JSON summary, no server
```

Single test, one workspace:

```sh
npm test -w daemon -- src/cache.test.ts
npm test -w dashboard -- src/features/weekly/model/weekly.test.ts
```

Swift (native app + `ObolCore`/`ObolUpdateCore` SwiftPM package):

```sh
swift test --package-path macos                       # all Swift tests, CLI
swift test --package-path macos --filter ClassName     # single test class/method
swiftformat --lint macos                               # CI also runs this
swiftlint lint --config .swiftlint.yml --path macos     # CI also runs this
open macos/Obol.xcodeproj                              # after npm run build; Cmd+U also runs Swift tests
```

Packaging (produces `dist/Obol-VERSION.{dmg,zip}` + `SHA256SUMS`):

```sh
npm run package:dmg
```

CI (`.github/workflows/ci.yml`) runs two jobs — `javascript` (lint, boundaries, contract fixtures, typecheck, test, version check) and `macos` (swiftformat/swiftlint, `swift test`, JS build, universal Release `xcodebuild` with `CODE_SIGNING_ALLOWED=NO`). Treat that job list as the required local checks before a PR.

## Architecture

All three runtimes follow the same dependency direction: **UI → domain → data → infrastructure** (see `docs/architecture.md`).

- **Domain code is pure**: no React, AppKit, `fetch`, filesystem, process, or wall-clock access unless a value is passed in.
- **Data code** owns API clients, stores, serialization, vendor normalization.
- **Infrastructure** owns processes, filesystem access, timers, OS services.
- **Controllers** coordinate services; they never render or do domain calculations.

### daemon (`daemon/src/`)

Layered by the same rule: `app/` (application services: `ConfigService`, `JournalService`, `UsageService`), `http/` (server + routes), `domain/` (pure transforms: budget, summary, time), `data/` (ccusage normalization, config/snapshot stores, journal), `providers/` (per-agent adapters: `claude.ts`, `codex.ts`, `opencode.ts`), `infra/` (process spawning, filesystem watcher). `src/server.ts` and `src/watcher.ts` at the top level are deprecated re-export shims (`@deprecated` — import from `http/server.js` / `infra/watcher.js` instead); don't add new code there. Entry point is `src/index.ts`, which wires everything and starts the HTTP server with a random per-process auth token.

### dashboard (`dashboard/src/`)

Feature-sliced: `app/` (composition root — `App`, `AppShell`, `DashboardPage`, providers), `features/*` (one directory per feature: `overview`, `history`, `breakdown`, `activity`, `journal`, `weekly`, `settings`, `share`), `shared/` (cross-feature UI, API client, analytics, lib).

**Feature boundary rule, enforced by `node scripts/check-boundaries.mjs` (also in CI):** a feature may import `shared/` and the contract, but never another feature directly. A feature's public surface is its `index.ts`; internal modules aren't public API. When a component needs a second consumer in a different feature, promote it into `shared/` rather than importing across features. Each feature directory has a short `README.md` stating what it owns — read it before adding to a feature.

### macos (`macos/`)

- `Sources/ObolCore` — Foundation-only models/formatting/currency/usage transforms, testable without SwiftUI/AppKit.
- `Sources/ObolUpdateCore` — the updater's pure logic, also Foundation-only.
- Both are a local SwiftPM package (`macos/Package.swift`) linked into the Xcode app target, so app and tests compile the same sources once.
- `Obol/Sources/` (the Xcode target) — `App`, `MenuBar`, `Features/{Settings,Usage}`, `Components`, `Controllers`, `Design`, `Services/{Daemon,System,Update}`.
- An Xcode Debug build runs the daemon from the host Mac's Node (checks common Homebrew/MacPorts/system/Volta/nvm/mise/fnm locations — Finder-launched apps don't inherit shell `PATH`); a packaged Release build bundles a universal Node runtime instead.

### Cross-language contract

`contract/fixtures/{summary,report,journal}.json` are the canonical shape of the daemon API; `macos/Tests/ObolCoreTests/Fixtures/*.json` must byte-match them (`npm run check-contract-fixtures` diffs the parsed JSON). Update both together when the contract shape changes.

### Local-only trust boundary

The daemon binds `127.0.0.1` only and writes a per-process 32-byte hex token to `~/.obol/runtime.json`. The native app sends it as an `x-token` header; the dashboard receives it once via `?t=` and then also uses the header (SSE can't carry headers, so the event stream is the one request still using the query param). The server checks both the token and that the request origin is loopback. Keep new endpoints inside this model — don't introduce non-loopback binding or unauthenticated routes. See `SECURITY.md` for the updater's separate trust model (TLS + SHA-256 + bundle/version checks; no Team ID pinning since the public build is ad-hoc signed, not notarized).

## Conventions

- Commit convention: `feat: ...` etc. for user-facing work (semantic-version bump on merge to `main` drives the release workflow). Keep formatter-only changes in their own commit.
- The root `package.json` version is the single source of truth; bump with `./scripts/set-version.sh x.y.z`, which stamps all three package.json files, the lockfile, and the Xcode `MARKETING_VERSION` (does not commit or tag).
