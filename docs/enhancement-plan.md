# Token Cost Widget — Enhancement Plan

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

This is the explicit ask, and the current implementation is thinner than it looks.

### 2.1 What's broken today

`macos/TokenCostWidget/Sources/Notifier.swift` is 23 lines and has five real defects:

1. **The first crossing never fires.** `guard let previousStatus` (line 13) bails when `previousStatus`
   is `nil`. Worse, `DaemonController.loadSnapshot()` (line 119) calls `observe()` with the disk
   snapshot *before* any network fetch — so if you launch the app already over budget, that first call
   silently seeds `previousStatus = .over` and you are never told.
2. **Alerts overwrite each other.** The request identifier is the constant
   `"token-cost-widget-budget"` (line 20). A monthly alert replaces a daily one in Notification Center.
3. **Alerts die with the UI.** Detection lives in the Swift app, not in the daemon that actually owns
   state. Nothing survives an app restart, so a quit/relaunch re-arms and re-fires the same alert.
4. **No cooldown.** A ratio oscillating around the threshold (80.1% → 79.8% → 80.2%) re-notifies on
   every crossing.
5. **Only two thresholds exist**, both in dollars, both after the fact. Nothing warns you *before* you
   overspend — no burn-rate alert, no projection alert, no 5-hour block/token-limit alert.

Also: permission is requested in `DaemonController.init()` (line 29) with the result discarded
(`{ _, _ in }`), and there is no UI anywhere showing that notifications were denied.

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

**New file `daemon/src/alert-ledger.ts`** — persists to `~/.token-cost-widget/alerts.json`:

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

### 3.2 Projects view

Second ccusage call: `daily --instances --json --offline -z <TZ>`. Gives cost per project per day.
New view with a project leaderboard and a stacked "cost by project over time" chart — `CostChart` can be
generalized to take a `groupBy: "agent" | "project"` prop rather than hard-coding `row.agents`.

### 3.3 Active block card

We already *fetch* `blocks --active` but `normalizeBlocks` (`daemon/src/types.ts:214`) throws away
everything except `burnRate.costPerHour` and `projection.totalCost`. Preserve `startTime`, `endTime`,
`tokenCounts`, `entries`, and the projection's remaining-time fields, then build a proper card:

- Ring showing elapsed / remaining in the 5-hour window
- Tokens used vs `--token-limit`, with the warn threshold marked
- Projected block total vs actual, side by side
- Sparkline of the last blocks (`blocks --recent`)

This replaces the current `BurnRate.tsx`, which is two numbers and an arrow.

### 3.4 Alerts view

A table of fired alerts from `GET /api/alerts` (when, what, value vs limit), per-kind enable toggles,
and snooze controls. Makes the notification system inspectable instead of magic.

---

## 4. Priority 2 — Dashboard polish

1. **Date range control** — `--since` / `--until` / `--last` wired to a range picker; right now History
   dumps everything and `CostChart` just `.slice(-31)`s it (`CostChart.tsx:30`).
2. **Dark mode** — every colour is a hard-coded light hex (`#f4f4f6`, `#111114`, …). Lift them into CSS
   custom properties and add a `prefers-color-scheme` block. The menu bar app is already system-themed;
   the dashboard is the odd one out.
3. **Richer chart interaction** — the bars use `<title>` tooltips only. Add a hover crosshair with a
   real tooltip, click-to-filter on the legend, and a cost/tokens toggle instead of two stacked charts.
4. **Comparison deltas** — "today vs your 7-day average", "this month vs last month". Trivial from data
   already in the report, and it's the number people actually want.
5. **Budget pace line** — overlay expected-spend-by-now against actual on the daily chart.
6. **Cost mode + week start selectors** in settings, feeding `--mode` and `--start-of-week`.
7. **Export** — CSV / JSON download of the current view.
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
- **Tests.** There are none. `budget.ts`, the new `alerts.ts`, `normalizeReport`/`normalizeBlocks`, and
  `periodMatchesToday` are all pure functions with sharp edges; they should have a vitest suite before
  the alert engine lands on top of them.

---

## 6. Bugs found while reading

**B1 — Monthly budget can be evaluated against the wrong month.**
`buildSummary` (`daemon/src/cache.ts:80`) takes `report.monthly[report.monthly.length - 1]` as "this
month". If there's no usage yet in the current month, that's *last* month's row, and the monthly budget
ratio — and therefore the monthly notification — is computed from the wrong number. Fix: match the row
by the current `YYYY-MM` key in the user's timezone, exactly as `periodMatchesToday` does for daily,
and fall back to zero rather than to a stale row.

**B2 — First-run notification suppression.** Covered in §2.1(1); calling it out separately because it
is a correctness bug, not just a design gap.

**B3 — Ordering is assumed, not requested.** `modelRowsFor` (`dashboard/src/components/totals.ts:76`)
and the monthly lookup above both assume ascending order from ccusage. Pass `--order asc` explicitly
so a ccusage default change can't silently invert the dashboard.

**B4 — Notification permission result discarded** (`DaemonController.swift:29`). A denied permission is
indistinguishable from a working one, from the user's perspective.

---

## 7. Suggested sequencing

| Step | Work | Rough size |
|---|---|---|
| 1 | Fix B1 + B3, add vitest coverage for `budget.ts` and the normalizers | S |
| 2 | `alerts.ts` + `alert-ledger.ts` + config fields + API endpoints | M |
| 3 | Rewrite `Notifier.swift`: per-alert ids, ack, actions, permission state | M |
| 4 | Alert settings in both UIs (`BudgetSettings.tsx`, popover `settingsPanel`) | S |
| 5 | Preserve block fields in `normalizeBlocks`; ship the active-block card | M |
| 6 | Sessions view (`--sections session`) | M |
| 7 | Projects view (`daily --instances`) | M |
| 8 | Date-range control, dark mode, chart interaction | M |
| 9 | Cost mode / week start / export / deltas | S |

Steps 1–4 deliver the notification ask end to end. Everything after is dashboard depth.
