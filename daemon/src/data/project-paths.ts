import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  type DayCounters,
  emptySession,
  type ProviderAdapter,
  type TranscriptFile,
} from "../providers/types.js";
import { asRecord } from "../shared/coerce.js";
import type { CcusageReport } from "./ccusage/types.js";

async function* jsonlRecords(path: string): AsyncIterable<Record<string, unknown>> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield asRecord(JSON.parse(line));
      } catch {}
    }
  } finally {
    lines.close();
    stream.close();
  }
}

async function pathFromFile(provider: ProviderAdapter, file: TranscriptFile): Promise<string | null> {
  const session = emptySession(file.sessionId, provider.id, file.projectDir);
  const day: DayCounters = { testRuns: 0, filesEdited: new Set(), toolMix: new Map() };
  const records = provider.read ? provider.read(file) : jsonlRecords(file.path);
  for await (const record of records) {
    provider.meta?.(record, session, file);
    provider.consume(record, session, day, file);
    if (session.projectPath) return session.projectPath;
  }
  return null;
}

/** Maps ccusage Claude project slugs to the cwd recorded in their transcripts. */
export async function collectProjectPaths(
  adapters: ProviderAdapter[],
  sinceMs: number,
): Promise<Record<string, string>> {
  const paths: Record<string, string> = {};

  for (const provider of adapters) {
    if (provider.id !== "claude") continue;
    let files: TranscriptFile[] = [];
    try {
      files = await provider.discover(provider.root(), sinceMs);
    } catch {
      continue;
    }

    const byDir = new Map<string, TranscriptFile[]>();
    for (const file of files) {
      if (!file.projectDir || file.isSubagent) continue;
      const list = byDir.get(file.projectDir) ?? [];
      list.push(file);
      byDir.set(file.projectDir, list);
    }

    for (const [slug, dirFiles] of byDir) {
      if (paths[slug]) continue;
      for (const file of dirFiles) {
        const path = await pathFromFile(provider, file);
        if (path) {
          paths[slug] = path;
          break;
        }
      }
    }
  }

  return paths;
}

export function attachProjectPaths(
  report: CcusageReport,
  projectPaths: Record<string, string>,
): CcusageReport {
  return { ...report, projectPaths };
}

export async function refreshProjectPaths(
  report: CcusageReport,
  adapters: ProviderAdapter[],
  sinceMs: number,
): Promise<CcusageReport> {
  return attachProjectPaths(report, await collectProjectPaths(adapters, sinceMs));
}
