<div align="center">

# Obol

**See what your AI coding agents cost — right from your menu bar.**

Obol is a local-first macOS app for tracking token usage and estimated spend
from Claude Code, Codex CLI, OpenCode, GitHub Copilot, and Cursor.

No account. No API key. No usage data uploads.

[![Download the latest DMG](https://img.shields.io/badge/Download-Obol.dmg-2ea44f?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/aakritsubedi/obol/releases/latest/download/Obol.dmg)

[All releases](https://github.com/aakritsubedi/obol/releases) · [Report an issue](https://github.com/aakritsubedi/obol/issues) · [Build from source](#build-from-source)

[![CI](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml/badge.svg)](https://github.com/aakritsubedi/obol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="docs/images/menu-bar.png" width="720" alt="Obol menu bar popover showing today's AI spend, a provider split, today's activity shape, and active sessions">

</div>

## Why Obol

AI coding tools make it easy to lose track of usage across projects and
providers. Obol keeps the answer close at hand while keeping the underlying
usage data on your Mac.

- **Menu bar overview** — see today’s total, provider split, token counts, and
  live or cached status in one click.
- **Local dashboard** — explore daily, weekly, and monthly history; provider
  and model breakdowns; activity intensity; and week-to-date leaders.
- **Work journal** — review agent sessions, prompts, projects, branches, tools,
  edited files, active minutes, and currently active work.
- **Budgets and alerts** — set daily and monthly budgets, choose a warning
  threshold, tune the history window and refresh floor, and receive native
  notifications when usage crosses a budget.
- **Sharing and export** — export the current history view as CSV or JSON, or
  create a shareable usage image from the dashboard.
- **Display currencies** — show amounts in a supported currency while keeping
  stored costs and budgets in USD.
- **Mac controls** — launch at login and optionally keep the Mac awake while
  an agent session is active, including with the lid closed when configured.
- **Quiet updates** — check GitHub Releases in the background and verify the
  update before installing it.

<div align="center">

<img src="docs/images/dashboard.png" width="860" alt="Obol dashboard showing today's spend, history, activity calendar, and provider breakdown">

</div>

## Install

1. Download [`Obol.dmg`](https://github.com/aakritsubedi/obol/releases/latest/download/Obol.dmg), or choose a version from [Releases](https://github.com/aakritsubedi/obol/releases).
2. Open the DMG and drag **Obol** to **Applications**.
3. Launch Obol. The first launch after downloading is blocked by macOS with
   *“Obol” Not Opened*. Click **Done**, then open **System Settings → Privacy &
   Security**, scroll to the Security section, and click **Open Anyway** next to
   Obol. Launch Obol again and confirm.

On macOS 14 and earlier you can instead right-click the app and choose
**Open**. macOS 15 (Sequoia) removed that shortcut, so **Open Anyway** in System
Settings is the path there. Either way it is a one-time step.

The public build is ad-hoc signed rather than notarized, which is why macOS
cannot verify it. This prompt is expected for an open-source project without a
paid Apple Developer ID; it is not an Obol permission request.

### Requirements

- macOS 13 or later
- Apple silicon or Intel Mac

Downloaded releases include a universal Node.js runtime, so end users do not
need Node.js, npm, or a shell configuration. Node.js 20 or later is required
only for development and source builds.

## Supported agents

Obol reads local records from the agents below. Missing or unused sources are
ignored, so installing one agent is enough to get started.

| Agent | Local source | What Obol can show |
| --- | --- | --- |
| Claude Code | `~/.claude/projects` | Provider totals, project history, session activity, and estimated session shares |
| Codex CLI | `~/.codex/sessions` | Provider totals, session activity, prompts, tools, edited files, and active work |
| OpenCode | `~/.local/share/opencode/opencode.db` | Provider totals, session activity, prompts, tools, edited files, and active work |
| GitHub Copilot | `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions` | Token-priced provider totals, session activity, prompts, tools, edited files, and active work |
| Cursor | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | Provider totals reconstructed from context shape, session activity, titles, and prompts |

Provider totals and history come from [ccusage](https://github.com/ryoppippi/ccusage)
using its report. Project-level cost history is currently Claude-only;
Codex, OpenCode, Copilot, and Cursor still contribute to aggregate provider and
daily totals. Copilot and Cursor costs are token-priced estimates against flat
subscriptions, not invoices.

## Accuracy and privacy

Obol shows cost estimates from its own model-pricing table, not provider
invoices. [ccusage](https://github.com/ryoppippi/ccusage) supplies token counts
and model breakdowns for Claude, Codex, and OpenCode; Obol reprices every agent
with the same table. A session’s cost is not a billing record: ccusage reports
daily cost by Claude project, so Obol apportions that project total across
Claude sessions by output tokens. Codex, OpenCode, Copilot, and Cursor session
records do not include a comparable per-project cost source.

Copilot and Cursor are flat-fee subscriptions, so their cost is Obol pricing the
tokens behind each turn — a figure for comparison, never a bill. Obol prices only
models it has a published rate for; a turn routed to an internal preview model,
which Copilot's `auto` mode does often, counts its tokens and reports no cost
rather than inventing one.

Cursor is the one agent that records no token counts of its own — the fields
exist but stay at zero. It does record the shape of each conversation's context:
how many tokens the harness occupies (system prompt, tools, rules, skills) and
how far the conversation had grown. Since every turn re-sends the whole context,
that shape and the turn times reconstruct what was sent. The overhead, the
conversation's final size, the turn count, and each turn's text come from Cursor;
Obol assumes the conversation grew evenly across those turns and that four
characters make a token. The harness prefix is identical on every turn, so it is
counted as a cache read after the first — which is what actually happens, and
what keeps the estimate near the real price. Treat Cursor's number as the
roughest of the four.

Usage processing is local:

- The daemon reads agent logs or databases from your home directory.
- The daemon listens on `127.0.0.1` only. Once a day it fetches a public
  model-pricing table from
  [aipricing.guru](https://www.aipricing.guru/api/pricing.json), caches it in
  `~/.obol/pricing.json`, and falls back to a bundled table when offline.
  ccusage reads local agent logs only; Obol reprices its output and prices
  Copilot and Cursor locally with that same table. No usage data is sent with
  the pricing fetch.
- Configuration and the last good snapshot stay in `~/.obol`.
- Obol does not upload agent logs, prompts, usage snapshots, or API keys.

The app can still make three kinds of optional network requests: GitHub Release
checks for the updater, the public Frankfurter API when you select a non-USD
display currency, and the daily pricing-table check described above. None of
these requests receive your usage data.

### Local state

| File | Purpose |
| --- | --- |
| `~/.obol/config.json` | Budgets, refresh settings, display currency, and other preferences |
| `~/.obol/pricing.json` | Cached model-pricing table used to estimate costs |
| `~/.obol/snapshot.json` | Last successful usage snapshot used while a refresh is unavailable |
| `~/.obol/runtime.json` | The running daemon’s loopback port and short-lived access token |
| `~/.obol/daemon.log` | Daemon startup and runtime diagnostics |

## How it works

### Pipeline

```text
 Agent data sources                 Obol daemon                           Outputs
 ──────────────────                 ───────────                           ───────

  Claude projects ──┐              ┌────────────────────────────┐
  Codex sessions  ──┤              │ 1. Watch agent data        │───────▶ Menu bar popover
  OpenCode DB     ──┼─────────────▶│ 2. Normalize via adapters  │
  Copilot chats   ──┤              │ 3. Reprice with Obol table │───────▶ Local dashboard (127.0.0.1)
  Cursor state    ──┘              │ 4. Summaries & budgets     │
                                   │ 5. Loopback HTTP + SSE     │───────▶ ~/.obol snapshot & config
                                   └────────────────────────────┘

                                   ccusage · fs watcher · ~/.obol stores
                                   (loopback-only, token-authenticated)
```

The daemon is the source of truth for both the native popover and the
dashboard. It watches supported agent data, refreshes usage on a configurable
interval, keeps the last good snapshot, and serves the dashboard from the
same loopback-only process.

### Fetching data from multiple providers

Obol never calls agent APIs or uploads your logs. Every refresh reads files
already on your Mac and combines them into one normalized report. Providers you
do not use are skipped; a broken or missing source does not block the others.

There are two tracks that run on each refresh:

| Track | What it covers | How it works |
| --- | --- | --- |
| **ccusage** | Claude, Codex, and OpenCode totals; Claude project costs | The daemon spawns the bundled [ccusage](https://github.com/ryoppippi/ccusage) CLI twice in parallel: once for daily, weekly, and monthly totals broken down by agent, and once for Claude per-project daily costs. ccusage reads each agent’s local logs and returns token counts; Obol reprices those rows with its model table before merging local-provider usage. |
| **Local adapters** | Copilot and Cursor totals; the work journal for all five agents | Each agent has a small adapter in the daemon that knows where its data lives and how to parse it. Adapters with a `usage` method return token counts and model names; Obol prices those with the same downloaded or bundled table. Every adapter also feeds the journal by discovering transcripts, reading records, and accumulating session activity. |

On refresh the daemon:

1. **Runs ccusage** for the configured history window and your local timezone.
2. **Collects local usage** by calling each adapter’s optional `usage` method
   (Copilot and Cursor today).
3. **Reprices** ccusage rows and **merges** local-provider rows into the
   normalized report so daily, weekly, monthly, and provider totals include
   every agent.
4. **Persists** the merged snapshot to `~/.obol/snapshot.json` and notifies the
   menu bar app and dashboard over loopback HTTP and SSE.

The work journal is built separately when you open a day: every installed
adapter discovers transcripts touched since that day, reads them in provider-
specific form, and folds the records into sessions (prompts, tools, edited
files, active minutes). Claude subagent and OpenCode child transcripts carry
their parent’s session id so the same work is not counted twice.

#### Where each agent’s data comes from

| Agent | Cost totals | Journal / session detail | On-disk format |
| --- | --- | --- | --- |
| **Claude Code** | ccusage | Adapter reads `~/.claude/projects` | Newline-delimited JSON (`.jsonl`) per session; subagents nested under the parent |
| **Codex CLI** | ccusage | Adapter reads `~/.codex/sessions` | JSONL rollouts under `YYYY/MM/DD/` |
| **OpenCode** | ccusage | Adapter queries `~/.local/share/opencode/opencode.db` | SQLite (`session`, `message`, `part` tables) |
| **GitHub Copilot** | Local adapter (`usage`) | Adapter reads VS Code `workspaceStorage/*/chatSessions` | JSON chat session files (stable VS Code and Insiders paths) |
| **Cursor** | Local adapter (`usage`) | Adapter queries `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | SQLite composer and bubble rows; tokens reconstructed from context shape when the agent records none |

Claude is the only agent whose per-project cost history can be joined to
sessions: ccusage keys projects by a slug derived from the working directory,
which matches how Claude names its project folders. Codex, OpenCode, Copilot,
and Cursor still appear in aggregate provider and daily totals and in the work
journal.

#### When data refreshes

- On a **timer** — interval from `~/.obol/config.json` (default: every 5 minutes).
- On **filesystem changes** — the daemon watches known agent directories (and
  scans `~/.config` for similarly named folders), ignores SQLite sidecar writes
  (`-wal`, `-shm`, `-journal`), debounces bursts, and respects a configurable
  **refresh floor** (default: 60 seconds) so rapid edits do not hammer ccusage.
- On **demand** — **Refresh** in the popover or dashboard, or when the native
  app starts.

If ccusage fails but local adapters still return rows, Obol keeps the last
merged snapshot rather than double-counting local usage on the next attempt.

## Troubleshooting

### The dashboard is empty or stale

Open an agent session, click **Refresh** in the popover or dashboard, and check
that the agent has written data to its local source path in the table above.
Obol keeps showing the last good snapshot when a refresh fails; the reason is
shown as a daemon notice in the dashboard.

### The daemon is unavailable

Check `~/.obol/daemon.log`. For a downloaded release, Node is bundled with the
app. For a development build, install Node.js 20 or later, then build the
daemon and dashboard before launching the native app:

```sh
npm ci
npm run build
```

### macOS blocks the first launch

macOS shows *“Obol” Not Opened — Apple could not verify “Obol” is free of
malware*, offering only **Done** and **Move to Trash**. Click **Done**, then go
to **System Settings → Privacy & Security**, scroll to the Security section, and
click **Open Anyway** next to Obol. On macOS 14 and earlier, right-clicking
**Obol.app** and choosing **Open** works too; macOS 15 removed that shortcut.

Equivalently, from a terminal:

```sh
xattr -dr com.apple.quarantine /Applications/Obol.app
```

This is expected for the ad-hoc signed public build. A Developer ID-signed,
notarized release would not need the step.

### A project or session is missing

Obol only counts records with timestamps that fall in the selected local day.
It also ignores subagent transcripts that replay work already attributed to a
parent session. Project cost history is available for Claude because Claude’s
project records can be joined to ccusage’s project report; other agents still
appear in aggregate usage and the work journal.

## Build from source

Source builds require macOS, Node.js 20 or later, npm 10, and Xcode 16 or
later. Install dependencies and build the JavaScript workspaces first:

```sh
npm ci
npm run build
```

To build a distributable universal app and installer artifacts:

```sh
npm run package:dmg
```

This writes the following to `dist/`:

- `Obol-VERSION.dmg` — drag-to-Applications installer
- `Obol-VERSION.zip` — artifact used by the in-app updater
- `SHA256SUMS` — SHA-256 checksums for the DMG and ZIP

Packaging vendors a universal Node runtime into the app. It may download the
pinned runtime on the first package build. The public artifact is ad-hoc
signed by default; signing and notarization details are in
[`macos/README.md`](macos/README.md).

### Development

Start the daemon first so the dashboard can read its runtime token, then start
Vite in a second terminal:

```sh
# terminal 1
npm run dev:daemon

# terminal 2
npm run dev:dashboard
```

Other useful commands:

```sh
npm run once -w daemon       # one refresh and a JSON summary
npm run typecheck            # TypeScript checks
npm test                     # JavaScript tests
npm run lint                 # Biome checks
node scripts/check-boundaries.mjs
npm run check-contract-fixtures
swift test --package-path macos
```

For native app builds, open [`macos/Obol.xcodeproj`](macos/Obol.xcodeproj)
after `npm run build`. More details about universal builds, version stamping,
packaging, and signing live in [`macos/README.md`](macos/README.md).

An Xcode Debug build uses Node from the host Mac rather than the packaged
runtime. The app checks common Homebrew, MacPorts, system, Volta, nvm, mise,
and fnm locations. Finder-launched apps do not inherit your shell’s `PATH`, so
if a Debug build cannot start the daemon, install Node 20+ in one of those
locations and inspect `~/.obol/daemon.log`.

## Releases and contributing

Merging to `main` triggers the release workflow. Commit subjects determine the
semantic-version bump, and GitHub Actions builds the universal DMG, updater
ZIP, and checksums. See [`docs/updater.md`](docs/updater.md) for the local
update fixture and trust model.

Pull requests are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for
the required checks and commit conventions, and use [`SECURITY.md`](SECURITY.md)
for the local boundary and updater security model.

## License

Obol is available under the [MIT License](LICENSE). It uses and credits
[ccusage](https://github.com/ryoppippi/ccusage) for usage estimation.
