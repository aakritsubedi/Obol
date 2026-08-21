# Obol — Enhancement Plan

Grounded in the [ccusage docs](https://ccusage.com/guide/) (v20.0.20, the pinned version) and the current
daemon / dashboard / menu-bar code.

---

## 1. What ccusage offers that we currently ignore

Today the daemon makes exactly two calls (`daemon/src/ccusage.ts:112-121`):

```
ccusage --json --offline --by-agent -z <TZ> --sections daily,weekly,monthly
ccusage blocks --json --offline --active
```

Everything below is documented ccusage surface area we never touch:

| Capability | Flag / command | Why it matters here |
|---|---|---|
| **Session reports** | `--sections session`, `session --id`, `--breakdown` | "Which conversation cost me $14?" — the single highest-value view we don't have |
| **Per-project grouping** | `daily --instances` / `--project` | "Which repo is burning my budget?" |
| **Block token limit** | `blocks --token-limit <n\|max>` | Real quota warnings inside the 5-hour window, not just dollars |
| **Recent blocks** | `blocks --recent` (last 3 days) | Block-over-block history; today we only ever see the active one |
| **Custom block length** | `blocks --session-length` | Not all plans are 5h |
| **Date bounding** | `--since` / `--until` / `--last` | We re-parse *all* history on every refresh |
| **Cost mode** | `--mode auto\|calculate\|display` | `display` = reconcile against actual Claude billing; `calculate` = consistent historical comparison |
| **Week start** | `weekly --start-of-week monday\|sunday` | Weekly rows currently use ccusage's default |
| **Ordering** | `--order asc\|desc` | We rely on incidental ordering (see bug B3) |
| **Per-model breakdown** | `--breakdown` / `-b` | We reconstruct this from `modelBreakdowns`; the flag gives it directly per session |
| **No-cost mode** | `--no-cost` | Token-only view for people who don't want dollar figures |

Not worth pursuing: `blocks --live` (we have our own watcher + SSE), `statusline` (that's for Claude
Code's own status bar), per-source namespaces like `ccusage claude daily` (`--by-agent` already covers it).

---

## 2. Priority 0 — Threshold notifications

The client-side notifier was rewritten to fix its launch and dedup defects (see §2.1); the deeper
design work below — moving detection into the daemon — is still open.

### 2.1 What's fixed and what remains

Fixed in `macos/Obol/Sources/Notifier.swift`:

1. **Launching already over budget now alerts once.** The notifier compares a `status:period` key
   against the previous observation instead of requiring a previous non-nil status, so the first
   observation fires like any other transition, and a day that rolls over while still over budget
   gets a fresh alert for the new period.
2. **Alerts no longer overwrite each other.** The request identifier is unique per status+period
   (`obol-budget.over:2026-08-21`), so simultaneous daily and monthly alerts both persist in
   Notification Center.
3. **Quit/relaunch no longer re-fires.** The last fired key and timestamp persist in UserDefaults;
   recovery (`ok`) clears the record so the next crossing notifies again.
4. **Flapping is suppressed.** A 30-minute cooldown guards against a ratio oscillating around a
   threshold (80.1% → 79.8% → 80.2%) re-notifying on every crossing.
5. **Denied permission is visible.** `requestPermission` reports its result through
   `DaemonController.notificationsDenied`, and the popover settings panel shows an inline row that
   deep-links to the notification pane of System Settings.

Still open:

1. **Detection lives in the Swift app, not in the daemon that owns state.** Nothing survives an app
   restart beyond the single dedup record, and the dashboard has no alert surface at all.
2. **Only two thresholds exist**, both in dollars, both after the fact. Nothing warns you *before*
   you overspend — no burn-rate alert, no projection alert, no 5-hour block/token-limit alert.

### 2.2 Design: move detection into the daemon

The daemon is the source of truth, persists to disk, and already broadcasts over SSE. Detection belongs
there; the Swift app becomes a dumb presenter, and the dashboard gets the same alerts for free.

**New file `daemon/src/alerts.ts`** — a rules engine over the summary:

```ts
type AlertKind =
  | "daily-warn" | "daily-over"
  | "weekly-warn" | "weekly-over"
  | "monthly-warn" | "monthly-over"
  | "block-tokens-warn" | "block-tokens-over"
  | "burn-rate"                 // $/hr above ceiling
  | "projected-daily-over";     // projection says you'll cross today's cap

interface Alert {
  id: string;        // stable + scoped: "daily-over:2026-08-20"
  kind: AlertKind;
  title: string;     // "Daily budget exceeded"
  body: string;      // "$24.10 of $20.00 — 121% of today's cap"
  severity: "warn" | "over";
  value: number; limit: number; ratio: number;
  firedAt: string;   // ISO
  deliveredAt: string | null;
}
```

Scoping the id by period is what makes this correct: `daily-over:2026-08-20` can only fire once per
day, and tomorrow's identical crossing gets a fresh id naturally — no manual reset logic.

**New file `daemon/src/alert-ledger.ts`** — persists to `~/.obol/alerts.json`:

- `evaluate(summary, config)` returns alerts whose id isn't already in the ledger.
- Records `firedAt`; applies a per-*kind* cooldown (default 30 min) so flapping can't spam.
- Keeps the last ~200 entries for the dashboard's alert history.
- Undelivered alerts stay pending, so an alert raised while the app was closed is delivered on next
  launch — capped to the last 6 hours so you don't get a burst of stale notifications.

**Wiring** (`daemon/src/index.ts` `refreshNow`): after `store.apply(...)`, call
`ledger.evaluate(...)`, then `server.broadcast(summary)` where the summary now carries
`alerts: Alert[]` (pending only).

**New endpoints** (`daemon/src/server.ts`):

- `GET  /api/alerts` — history for the dashboard
- `POST /api/alerts/ack` — body `{ ids: string[] }`, marks `deliveredAt`
- `POST /api/alerts/snooze` — body `{ kind, untilMs }`
- SSE gains an `event: alert` frame so the dashboard can toast immediately

**Swift side** (`Notifier.swift` rewritten):

- Subscribe to SSE instead of the 15s poll (or keep the poll and read `summary.alerts` — either way
  the app stops doing its own detection).
- One `UNNotificationRequest` per alert, `identifier = alert.id` — no more clobbering.
- `UNNotificationCategory` with actions: **Open dashboard** and **Snooze 1h**.
- `POST /api/alerts/ack` after `add()` succeeds.
- Surface the authorization status: if denied, show an inline row in the popover settings panel that
  deep-links to `x-apple.systempreferences:com.apple.preference.notifications`.

### 2.3 New config surface

`WidgetConfig` (`daemon/src/types.ts:75`, `daemon/src/config.ts:6`) gains:

```ts
weeklyBudget: number | null;
blockTokenLimit: number | null;      // feeds `blocks --token-limit`
burnRateCeiling: number | null;      // $/hour
costMode: "auto" | "calculate" | "display";
startOfWeek: "monday" | "sunday";
notifications: {
  enabled: boolean;
  kinds: Record<AlertKind, boolean>;  // per-alert opt-out
  cooldownMs: number;                 // default 1_800_000
};
```

`parseConfig` must validate each of these the way it already validates `warningThreshold` — the
existing clamp-with-fallback pattern extends cleanly.

Both UIs get the controls: the dashboard's `BudgetSettings.tsx` grows a "Alerts" fieldset; the
popover's `settingsPanel` (currently just a Launch-at-login toggle) grows a master notifications switch.

### 2.4 Acceptance checks

- Launch the app while already over the daily cap → notification appears within one refresh.
- Cross daily *and* monthly in the same refresh → two separate notifications, both persist.
- Cross, quit, relaunch → **no** duplicate.
- Cross at 23:58, roll past midnight, cross again → second notification (new period id).
- Deny notification permission → popover shows the denied state with a link to System Settings.

---

## 3. Priority 1 — New dashboard views

### 3.1 Sessions view *(biggest single win)*

Add `session` to `--sections`. New `dashboard/src/components/SessionTable.tsx`: sessions sorted by cost
(ccusage's default order), showing session id, project, models, tokens, cost, last activity, with an
expandable per-model breakdown. Add a "Top 5 sessions today" strip to the Today card.

### 3.2 Projects view *(shipped)*

Shipped: the daemon runs `daily --instances --json --offline -z <TZ>` as a second ccusage call, and
the dashboard renders a project leaderboard (`ProjectTable.tsx`) plus a "cost by project over time"
chart. Still open from this item: generalizing `CostChart`'s `groupBy` prop beyond `"agent" |
"project"` if more groupings arrive.

### 3.3 Active block card

The data layer is ready: `normalizeBlocks` (`daemon/src/types.ts:308`) preserves `startTime`,
`endTime`, `tokenCounts`, `entries`, and the projection's remaining-time fields, and exposes
`tokenLimitStatus`. What's missing is only presentation:

- Ring showing elapsed / remaining in the 5-hour window
- Tokens used vs `--token-limit`, with the warn threshold marked
- Projected block total vs actual, side by side
- Sparkline of recent blocks (`blocks --recent`)

### 3.4 Alerts view

A table of fired alerts from `GET /api/alerts` (when, what, value vs limit), per-kind enable toggles,
and snooze controls. Makes the notification system inspectable instead of magic.

---

## 4. Priority 2 — Dashboard polish

1. **Date range control** — `--since` / `--until` / `--last` wired to a range picker; the History
   view currently bounds client-side to 7/30/90 days (`rangeRows` in `App.tsx`), which is fine, but
   the daemon still re-parses the full configured window on every refresh.
2. **Dark mode** *(shipped)* — `index.css` defines light and dark palettes as CSS custom properties
   behind `prefers-color-scheme`; components reference tokens only.
3. **Richer chart interaction** — the bars use `<title>` tooltips only. Add a hover crosshair with a
   real tooltip, click-to-filter on the legend, and a cost/tokens toggle instead of two stacked charts.
4. **Comparison deltas** *(shipped)* — "today vs your 7-day average" and "this month vs last month"
   render in `TotalsCard` (`todayComparison` / `monthComparison` in `App.tsx`).
5. **Budget pace line** — overlay expected-spend-by-now against actual on the daily chart.
6. **Cost mode + week start selectors** in settings, feeding `--mode` and `--start-of-week`.
7. **Export** *(shipped)* — CSV / JSON download of the current history view (builders in
   `dashboard/src/export.ts`, covered by vitest).
8. **Empty and error states** — several components render bare text; give them the same card treatment.

---

## 5. Daemon and data-layer work

- **Bound the history query.** Every refresh re-parses all logs. Use `--since` for a rolling 90-day
  window on the hot path and fetch full history lazily when the user asks for it.
- **Batch the calls.** Sessions fold into the existing `--sections`; projects and blocks need their own
  spawns. Keep it to three `Promise.allSettled` children max, and keep the existing coalescing in
  `refreshNow` (`daemon/src/index.ts:55`) — it's the right design.
- **Surface ccusage's version** in the summary so the UI can warn when the pinned version drifts.
- **Emit a `blocks` SSE frame** — block state changes far faster than daily totals.
- **Tests.** The pure core is covered: the daemon has vitest suites for `budget.ts`, `cache.ts`
  (`buildSummary`), `time.ts`, and the `types.ts` normalizers, and the dashboard covers `format.ts`,
  `totals.ts`, and the export builders. Still untested: the daemon's server/watcher/ccusage glue
  (integration-shaped; needs fixture processes or injected transports) and every React component.

---

## 6. Bugs found while reading

**B1 — Monthly budget evaluated against the wrong month.** *(fixed)* `buildSummary`
(`daemon/src/cache.ts:78`) now matches the monthly row against the current `YYYY-MM` key in the
user's timezone via `periodMatchesMonth`, and falls back to zero rather than to a stale row.

**B2 — First-run notification suppression.** *(fixed)* Covered in §2.1; the notifier now alerts on
the first observation instead of silently seeding state.

**B3 — Ordering is assumed, not requested.** The daemon sorts rows itself after normalization
(`sortRowsAscending` in `daemon/src/types.ts`), but ccusage's own ordering is still relied on for
`modelRowsFor` (`dashboard/src/components/totals.ts:76`) and the monthly lookup. Passing
`--order asc` explicitly would make a ccusage default change unable to silently invert the dashboard.

**B4 — Notification permission result discarded.** *(fixed)* The authorization result now flows
through `DaemonController.notificationsDenied` into the popover settings panel (§2.1).

---

## 7. Suggested sequencing

| Step | Work | Rough size | Status |
|---|---|---|---|
| 1 | Fix B1 + B3, add vitest coverage for `budget.ts` and the normalizers | S | B1 + tests done; B3 open |
| 2 | `alerts.ts` + `alert-ledger.ts` + config fields + API endpoints | M | open |
| 3 | Rewrite `Notifier.swift`: per-alert ids, ack, actions, permission state | M | client-side fixes shipped (§2.1); daemon-driven alerts remain step 2+ |
| 4 | Alert settings in both UIs (`BudgetSettings.tsx`, popover `settingsPanel`) | S | denied-permission row shipped; full alert settings open |
| 5 | Preserve block fields in `normalizeBlocks`; ship the active-block card | M | data layer done; card open |
| 6 | Sessions view (`--sections session`) | M | open |
| 7 | Projects view (`daily --instances`) | M | shipped |
| 8 | Date-range control, dark mode, chart interaction | M | dark mode shipped; rest open |
| 9 | Cost mode / week start / export / deltas | S | export + deltas shipped; cost mode + week start open |

Steps 2–4 deliver the notification ask end to end. Everything after is dashboard depth.
