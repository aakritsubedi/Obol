import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DayJournal, WidgetConfig } from "@obol/contract";
import { ConfigService } from "./app/ConfigService.js";
import { JournalService } from "./app/JournalService.js";
import { UsageService } from "./app/UsageService.js";
import type { CcusageReport } from "./data/ccusage/types.js";
import { ConfigStore, migrateLegacyState } from "./data/config-store.js";
import { SnapshotStore } from "./data/snapshot-store.js";
import { systemTime } from "./domain/time.js";
import { DaemonServer } from "./http/server.js";
import { runOnce } from "./infra/process.js";
import { AgentLogWatcher } from "./infra/watcher.js";

const daemonDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));

function dashboardRoot(): string {
  return process.env.OBOL_DASHBOARD_DIST || resolve(daemonDirectory, "../../dashboard/dist");
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  await migrateLegacyState();
  const configStore = new ConfigStore();
  let config = await configStore.load();
  const store = new SnapshotStore(configStore.paths.snapshot, config, systemTime);
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
  let server: DaemonServer | null = null;
  let fallbackTimer: NodeJS.Timeout | null = null;
  let watcher: AgentLogWatcher | null = null;
  let parentWatchTimer: NodeJS.Timeout | null = null;
  let stopping = false;

  let journalService: JournalService;
  const usageService = new UsageService({
    getConfig: () => config,
    getLiveReport: () => liveReport,
    setLiveReport: (report) => {
      liveReport = report;
    },
    store,
    onChanged: () => {
      journalService.forgetToday();
      server?.broadcast(store.get().summary);
    },
  });
  journalService = new JournalService({
    getConfig: () => config,
    getLiveReport: () => liveReport,
    time: systemTime,
  });

  const restartFallback = (milliseconds: number): void => {
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = setInterval(() => {
      void usageService.scheduleRefresh();
    }, milliseconds);
  };

  const configService = new ConfigService({
    configStore,
    store,
    getConfig: () => config,
    setConfig: (next) => {
      config = next;
    },
    usage: usageService,
    journal: journalService,
    onRefreshIntervalChange: restartFallback,
    onChanged: () => server?.broadcast(store.get().summary),
  });

  const requestedPort = Number(flagValue("--port"));
  if (Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535) {
    config = await configStore.update({ port: requestedPort });
  }

  server = new DaemonServer({
    port: config.port,
    token,
    staticRoot: dashboardRoot(),
    handlers: {
      getSummary: () => store.get().summary,
      getReport: () => liveReport,
      getBlocks: () => store.get().blocks,
      getConfig: () => config,
      updateConfig: (patch: Partial<WidgetConfig>) => configService.update(patch),
      refresh: () => usageService.scheduleRefresh(true),
      getJournal: (date: string | null): Promise<DayJournal> => journalService.read(date),
      getActiveSessions: () => journalService.active(),
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
    journalService.forgetToday();
    void usageService.scheduleRefresh();
  });
  watcher.start();
  restartFallback(config.refreshIntervalMs);
  void usageService.refreshNow();

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    usageService.close();
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
