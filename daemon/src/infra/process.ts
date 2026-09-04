import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BlocksReport, WidgetConfig } from "@obol/contract";
import { normalizeBlocks, normalizeProjects, normalizeReport } from "../data/ccusage/normalize.js";
import type { CcusageReport } from "../data/ccusage/types.js";
import { dateForTimeZone, shiftDate, systemTimeZone } from "../domain/time.js";
import type { RefreshResult } from "../types.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Keep looking; npm's workspace layout varies between npm and pnpm.
    }
  }
  return null;
}

async function ccusageCli(): Promise<string> {
  const candidates = [
    resolve(moduleDirectory, "../node_modules/ccusage/src/cli.js"),
    resolve(moduleDirectory, "../../node_modules/ccusage/src/cli.js"),
    resolve(process.cwd(), "node_modules/ccusage/src/cli.js"),
    resolve(process.cwd(), "daemon/node_modules/ccusage/src/cli.js"),
  ];
  const cli = await firstExisting(candidates);
  if (cli) return cli;
  throw new Error(
    `ccusage runtime is missing; rebuild the app after npm install (looked in ${candidates.join(delimiter)})`,
  );
}

function parseJson(output: string, label: string): unknown {
  const trimmed = output.replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // A CLI warning can precede JSON. Keep this fallback strict enough to avoid
    // silently accepting a random fragment while remaining useful in practice.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // Fall through to the useful error below.
      }
    }
    throw new Error(`${label} returned invalid JSON`);
  }
}

function runCli(cli: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    // The menu-bar app does not inherit the user's shell PATH, so spawning the
    // ccusage shim would make /usr/bin/env unable to find node. Use the exact
    // Node executable that is already running this daemon instead.
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new Error(`ccusage ${args[0] || "report"} timed out`));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(
          new Error(
            `ccusage ${args[0] || "report"} exited with ${code}: ${stderr.trim() || "unknown error"}`,
          ),
        );
      } else {
        resolvePromise(stdout);
      }
    });
  });
}

export async function runUsage(config?: Pick<WidgetConfig, "historyDays">): Promise<RefreshResult> {
  let cli: string;
  try {
    cli = await ccusageCli();
  } catch (error) {
    return {
      report: null,
      blocks: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  const timezone = systemTimeZone();
  const until = dateForTimeZone(new Date(), timezone);
  const historyDays = Math.max(7, Math.min(365, Math.trunc(config?.historyDays ?? 90)));
  const since = shiftDate(until, -(historyDays - 1), timezone);
  const reportArgs = [
    "--json",
    "--offline",
    "--by-agent",
    "-z",
    timezone,
    "--sections",
    "daily,weekly,monthly",
    "--since",
    since,
    "--until",
    until,
  ];
  const projectArgs = [
    "claude",
    "daily",
    "--instances",
    "--json",
    "--offline",
    "-z",
    timezone,
    "--since",
    since,
    "--until",
    until,
  ];
  const [reportResult, projectResult] = await Promise.allSettled([
    runCli(cli, reportArgs),
    runCli(cli, projectArgs),
  ]);

  let report: CcusageReport | null = null;
  let fullReport: CcusageReport | null = null;
  const errors: string[] = [];
  if (reportResult.status === "fulfilled") {
    try {
      fullReport = normalizeReport(parseJson(reportResult.value, "ccusage report"));
      report = fullReport;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "ccusage report could not be parsed");
    }
  } else {
    errors.push(
      reportResult.reason instanceof Error ? reportResult.reason.message : String(reportResult.reason),
    );
  }

  if (projectResult.status === "fulfilled") {
    try {
      const projects = normalizeProjects(parseJson(projectResult.value, "ccusage projects"));
      if (fullReport) {
        fullReport = { ...fullReport, projects };
        report = fullReport;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "ccusage projects could not be parsed");
    }
  } else {
    errors.push(
      projectResult.reason instanceof Error ? projectResult.reason.message : String(projectResult.reason),
    );
  }

  return { report, fullReport, blocks: null, errors };
}

export async function runOnce(
  config?: Pick<WidgetConfig, "historyDays">,
): Promise<{ report: CcusageReport; fullReport: CcusageReport; blocks: BlocksReport }> {
  const result = await runUsage(config);
  if (!result.report) throw new Error(result.errors.join("; ") || "ccusage report unavailable");
  return {
    report: result.report,
    fullReport: result.fullReport ?? result.report,
    blocks: result.blocks ?? normalizeBlocks({ blocks: [] }),
  };
}
