# Token Cost Widget

Token Cost Widget is a local-first macOS menu bar companion for [ccusage](https://github.com/ryoppippi/ccusage). It keeps one daemon as the source of truth for the menu bar and dashboard, watches agent logs for changes, and stores the last good snapshot on disk.

## Requirements

- macOS 15 or later
- Node.js 20 or later
- Xcode 16 or later for the native menu bar app

The daemon pins `ccusage` to `20.0.20` and always invokes it with `--offline`.
When packaged, it launches ccusage through the Node executable running the daemon rather than relying on the user's shell `PATH` or `npx`.

## Development

```sh
npm install
npm run build
npm run dev:daemon
npm run dev:dashboard
```

The daemon binds to `127.0.0.1:4737` by default. If that port is unavailable it chooses an ephemeral port and records the actual port and token in `~/.token-cost-widget/runtime.json`. The Vite dashboard proxies `/api` to the daemon during development.

For a parser smoke test without starting the HTTP server:

```sh
npm run once -w daemon
```

Runtime data lives in `~/.token-cost-widget/`:

- `config.json` — budgets, history window, and refresh interval
- `runtime.json` — the current local port and API token
- `snapshot.json` — the last good ccusage report

Set `TOKEN_COST_WIDGET_HOME` to use another state directory while developing or testing.

## Dashboard

The dashboard includes Today, interactive History, Models, Claude Projects, Budget settings in a header popup, and CSV/JSON export. Projects are combined by display name and show the top five rows by default, with the full table available on demand. It is served by the daemon after `npm run build`; in development it runs through Vite with hot module replacement. Opening the dashboard requests one daemon-managed fresh ccusage snapshot, and returning to the window refreshes again. Concurrent refresh requests are coalesced, so the dashboard and menu bar do not spawn duplicate usage processes.

The daemon bounds the hot-path ccusage query to the configured history window (90 days by default). Claude project grouping uses ccusage's focused `daily --instances` command and is labeled accordingly in the dashboard.

Cost values are estimates from ccusage's pricing table and are not invoices.
