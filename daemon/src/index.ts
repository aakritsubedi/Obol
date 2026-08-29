import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SnapshotStore } from "./cache.js";
import { runOnce, runUsage } from "./ccusage.js";
import { ConfigStore, migrateLegacyState } from "./config.js";
import { activeSessions, readDayJournal } from "./journal.js";
import { DaemonServer } from "./server.js";
import { dateForTimeZone } from "./time.js";
import { type CcusageReport, type DayJournal, emptyBlocks, type WidgetConfig } from "./types.js";
import { AgentLogWatcher } from "./watcher.js";

const daemonDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));

function dashboardRoot(): string {
  return process.env.OBOL_DASHBOARD_DIST || resolve(daemonDirectory, "../../dashboard/dist");
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "UTC";
}

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  await migrateLegacyState();
  const configStore = new ConfigStore();
  let config = await configStore.load();
  const store = new SnapshotStore(configStore.paths.snapshot, config);
  await store.load(config);
  let liveReport: CcusageReport = store.get().report;

  if (hasFlag("--once")) {
    const { report, blocks } = await runOnce(config);
    await store.apply(report, blocks, config);
    console.log(
      JSON.stringify(
        {
          today: store.get().summary.today,
          agents: store.get().summary.agents,
          burnRate: store.get().summary.burnRate,
          projection: store.get().summary.projection,
          budgetStatus: store.get().summary.budgetStatus,
          updatedAt: store.get().summary.updatedAt,
        },
        null,
        2,
      ),
    );
    return;
  }

  const token = randomBytes(32).toString("hex");
  // Walking the transcript tree is far more expensive than serving a snapshot,
  // so each day is computed once. Today's entry is dropped whenever the watcher
  // sees a transcript change or a refresh lands new cost data; past days do not
  // change and are kept for the life of the daemon.
  const journalCache = new Map<string, DayJournal>();
  const forgetToday = (): void => {
    journalCache.delete(dateForTimeZone(new Date(), systemTimeZone()));
  };
  let refreshPromise: Promise<void> | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let fallbackTimer: NodeJS.Timeout | null = null;
  let watcher: AgentLogWatcher | null = null;
  let server: DaemonServer | null = null;
  let parentWatchTimer: NodeJS.Timeout | null = null;
  let stopping = false;

  const refreshNow = async (): Promise<void> => {
    // Every trigger shares the same in-flight refresh. This keeps the dashboard,
    // popover, watcher, and fallback timer from spawning duplicate ccusage runs.
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const result = await runUsage(config);
      const current = store.get();
      if (result.report || result.blocks) {
        const report = result.report ?? current.report;
        const blocks = result.blocks ?? emptyBlocks();
        liveReport = result.fullReport ?? result.report ?? liveReport;
        const message = result.errors.length ? result.errors.join("; ") : null;
        await store.apply(report, blocks, config, message);
        // Today's journal quotes cost from this report, so it has to be rebuilt.
        forgetToday();
        server?.broadcast(store.get().summary);
      } else {
        await store.markError(config, result.errors.join("; ") || "ccusage refresh failed");
        server?.broadcast(store.get().summary);
      }
    })();
    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  };

  const scheduleRefresh = (immediate = false): Promise<void> => {
    if (immediate) return refreshNow();
    if (debounceTimer) clearTimeout(debounceTimer);
    return new Promise((resolvePromise) => {
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshNow().finally(resolvePromise);
      }, 2_000);
    });
  };

  const requestedPort = Number(flagValue("--port"));
  if (Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535) {
    config = await configStore.update({ port: requestedPort });
  }

  const readJournal = async (requested: string | null): Promise<DayJournal> => {
    const timezone = systemTimeZone();
    const date = requested ?? dateForTimeZone(new Date(), timezone);
    const cached = journalCache.get(date);
    if (cached && cached.idleMinutes === config.journalIdleMinutes) return cached;
    const journal = await readDayJournal({
      date,
      timezone,
      idleMinutes: config.journalIdleMinutes,
      report: liveReport,
    });
    // Caching a journal built before the first ccusage run would pin its
    // costs at zero for the rest of the day, so hold it back until the
    // report it drew from actually had project rows to join against.
    if (liveReport.projects.length > 0) journalCache.set(date, journal);
    return journal;
  };

  server = new DaemonServer({
    port: config.port,
    token,
    staticRoot: dashboardRoot(),
    handlers: {
      getSummary: () => store.get().summary,
      getReport: () => liveReport,
      getBlocks: () => store.get().blocks,
      getConfig: () => config,
      updateConfig: async (patch: Partial<WidgetConfig>) => {
        config = await configStore.update(patch);
        await store.reconfigure(config);
        if (patch.refreshIntervalMs !== undefined) {
          if (fallbackTimer) clearInterval(fallbackTimer);
          fallbackTimer = setInterval(() => {
            void scheduleRefresh();
          }, config.refreshIntervalMs);
        }
        if (patch.historyDays !== undefined) {
          await scheduleRefresh(true);
        }
        if (patch.journalIdleMinutes !== undefined) journalCache.clear();
        return config;
      },
      refresh: () => scheduleRefresh(true),
      getJournal: readJournal,
      // Built from today's journal rather than a separate walk of the
      // transcripts: the cache above is already dropped whenever the watcher
      // sees a write, which is exactly when a running session changes.
      getActiveSessions: async () =>
        activeSessions(await readJournal(null), new Date(), config.journalIdleMinutes),
    },
  });

  const port = await server.start();
  await configStore.writeRuntime({
    port,
    token,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    dashboardUrl: `http://127.0.0.1:${port}/?t=${token}`,
  });

  watcher = new AgentLogWatcher(() => {
    forgetToday();
    void scheduleRefresh();
  });
  watcher.start();
  fallbackTimer = setInterval(() => {
    void scheduleRefresh();
  }, config.refreshIntervalMs);
  void refreshNow();

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (fallbackTimer) clearInterval(fallbackTimer);
    if (parentWatchTimer) clearInterval(parentWatchTimer);
    watcher?.close();
    await server?.close();
    await configStore.clearRuntime();
  };
  const parentPid = Number(flagValue("--parent-pid"));
  if (Number.isInteger(parentPid) && parentPid > 1 && parentPid !== process.pid) {
    parentWatchTimer = setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          void stop().finally(() => process.exit(0));
        }
      }
    }, 2_000);
  }
  process.once("SIGINT", () => {
    void stop().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void stop().finally(() => process.exit(0));
  });
  process.once("exit", () => {
    watcher?.close();
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
