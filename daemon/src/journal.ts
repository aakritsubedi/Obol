import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  type DayCounters,
  providers as defaultProviders,
  emptySession,
  type ProviderAdapter,
  type SessionAccumulator,
  type TranscriptFile,
} from "./providers/index.js";
import { dateForTimeZone } from "./time.js";
import {
  asRecord,
  type CcusageReport,
  type DayJournal,
  type JournalProject,
  type JournalSession,
  numberValue,
  type ProjectUsageRow,
} from "./types.js";

export { promptText } from "./providers/index.js";

// Sum the gaps between consecutive events, counting only those short enough to
// read as one continuous stretch of work. Long gaps split the day into blocks
// rather than inflating the total.
export function activeSpan(
  timestamps: number[],
  idleMs: number,
): { activeMs: number; blocks: number; spanMs: number } {
  if (timestamps.length === 0) return { activeMs: 0, blocks: 0, spanMs: 0 };
  const sorted = [...timestamps].sort((left, right) => left - right);
  let activeMs = 0;
  let blocks = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const delta = sorted[index] - sorted[index - 1];
    if (delta <= idleMs) activeMs += delta;
    else blocks += 1;
  }
  return { activeMs, blocks, spanMs: sorted[sorted.length - 1] - sorted[0] };
}

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

// Given a working directory, its last segment. Falls back to the last dashed
// segment so a project-directory slug (a cwd with every "/" replaced by "-",
// which is also how ccusage keys its per-project rows) still reads sensibly.
export function projectName(value: string): string {
  const path = value.split("/").filter(Boolean);
  if (path.length > 1) return path[path.length - 1];
  const dashed = value.split("-").filter(Boolean);
  return dashed[dashed.length - 1] || value;
}

// ~/.claude/projects names a directory after the working directory with every
// separator replaced by a dash, which is also how ccusage keys its per-project
// rows. It is the only join key the two sides share.
export function projectSlug(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

// Most agents keep newline-delimited JSON, but a torn final line from a live
// session is normal, so each line parses independently.
async function* jsonlRecords(path: string): AsyncIterable<Record<string, unknown>> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield asRecord(JSON.parse(line));
      } catch {
        continue;
      }
    }
  } finally {
    lines.close();
    stream.close();
  }
}

async function readTranscript(
  provider: ProviderAdapter,
  file: TranscriptFile,
  date: string,
  timezone: string,
  sessions: Map<string, SessionAccumulator>,
  day: DayCounters,
): Promise<void> {
  // Sessions are keyed by provider as well as id, so two agents can never
  // collide on a shared uuid.
  const key = `${provider.id}:${file.sessionId}`;
  const session = sessions.get(key) ?? emptySession(file.sessionId, provider.id, file.projectDir);
  sessions.set(key, session);

  const records = provider.read ? provider.read(file) : jsonlRecords(file.path);
  for await (const record of records) {
    provider.meta?.(record, session, file);

    const timestamp = provider.timestampOf(record);
    if (timestamp === null) continue;
    if (dateForTimeZone(new Date(timestamp), timezone) !== date) continue;

    session.timestamps.push(timestamp);
    provider.consume(record, session, day, file);
  }
}

interface ProjectUsage {
  totalCost: number;
  totalTokens: number;
}

// Per-project spend is only ever reported for Claude, so this map is a partial
// picture. The day's headline total comes from the all-agent daily row instead.
function usageBySlug(report: CcusageReport | null, date: string): Map<string, ProjectUsage> {
  const usage = new Map<string, ProjectUsage>();
  if (!report) return usage;
  for (const row of report.projects as ProjectUsageRow[]) {
    if (!row.period.startsWith(date)) continue;
    const existing = usage.get(row.project) ?? { totalCost: 0, totalTokens: 0 };
    existing.totalCost += numberValue(row.totalCost);
    existing.totalTokens += numberValue(row.totalTokens);
    usage.set(row.project, existing);
  }
  return usage;
}

// The daily rows are built with --by-agent, so this is every agent's spend for
// the day — the same figure the dashboard's Today card shows. Using the
// per-project sum here instead would silently report Claude only.
function dayTotals(report: CcusageReport | null, date: string): ProjectUsage | null {
  if (!report) return null;
  const compact = date.replace(/-/g, "");
  const row = report.daily.find((daily) => {
    const period = String(daily.period);
    return period === date || period.replace(/[^0-9]/g, "") === compact || period.startsWith(date);
  });
  if (!row) return null;
  return { totalCost: numberValue(row.totalCost), totalTokens: numberValue(row.totalTokens) };
}

interface ProjectAccumulator extends Omit<JournalProject, "providers"> {
  providers: Set<string>;
  timestamps: number[];
}

export interface JournalOptions {
  date: string;
  timezone: string;
  idleMinutes: number;
  report?: CcusageReport | null;
  providers?: ProviderAdapter[];
}

export async function readDayJournal(options: JournalOptions): Promise<DayJournal> {
  const { date, timezone, report = null } = options;
  const idleMinutes = Math.min(120, Math.max(1, Math.trunc(options.idleMinutes) || 15));
  const idleMs = idleMinutes * 60_000;
  const adapters = options.providers ?? defaultProviders;

  // Start the window a day and a half early so a transcript whose last write
  // landed just after the local day ended is still considered.
  const sinceMs = Date.parse(`${date}T00:00:00Z`) - 36 * 3_600_000;

  const sessions = new Map<string, SessionAccumulator>();
  const day: DayCounters = { testRuns: 0, filesEdited: new Set(), toolMix: new Map() };

  for (const provider of adapters) {
    let files: TranscriptFile[] = [];
    try {
      files = await provider.discover(provider.root(), sinceMs);
    } catch {
      // A provider that is not installed, or whose layout changed, must not
      // cost us the other providers' sessions.
      continue;
    }
    for (const file of files) {
      try {
        await readTranscript(provider, file, date, timezone, sessions, day);
      } catch {
        // One unreadable transcript must not lose the rest of the day.
      }
    }
  }

  const active = [...sessions.values()].filter((session) => session.timestamps.length > 0);
  const usage = usageBySlug(report, date);

  // ccusage reports cost per project per day, never per session, so a session's
  // share is apportioned by output tokens. Callers must present it as an
  // estimate; the project total it derives from is the exact figure.
  const outputByProject = new Map<string, number>();
  for (const session of active) {
    const slug = slugFor(session);
    if (!slug) continue;
    outputByProject.set(slug, (outputByProject.get(slug) ?? 0) + session.outputTokens);
  }

  const journalSessions: JournalSession[] = active
    .map((session) => {
      const span = activeSpan(session.timestamps, idleMs);
      const sorted = [...session.timestamps].sort((left, right) => left - right);
      const slug = slugFor(session);
      const projectUsage = slug ? usage.get(slug) : undefined;
      const projectOutput = slug ? (outputByProject.get(slug) ?? 0) : 0;
      const totalCost =
        projectUsage === undefined
          ? null
          : projectOutput > 0
            ? (projectUsage.totalCost * session.outputTokens) / projectOutput
            : projectUsage.totalCost;
      return {
        id: `${session.provider}:${session.id}`,
        provider: session.provider,
        title: session.title ?? derivedTitle(session.prompts[0]),
        project: session.projectPath
          ? projectName(session.projectPath)
          : session.projectDir
            ? projectName(session.projectDir)
            : "unknown",
        projectPath: session.projectPath,
        gitBranch: session.gitBranch,
        startedAt: new Date(sorted[0]).toISOString(),
        endedAt: new Date(sorted[sorted.length - 1]).toISOString(),
        activeMinutes: minutes(span.activeMs),
        humanPrompts: session.humanPrompts,
        assistantTurns: session.assistantTurns,
        toolCalls: session.toolCalls,
        filesEdited: [...session.filesEdited].sort(),
        models: [...session.models].sort(),
        prompts: session.prompts,
        toolMix: Object.fromEntries([...session.toolMix.entries()].sort((left, right) => right[1] - left[1])),
        totalCost,
      };
    })
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  const projects = new Map<string, ProjectAccumulator>();
  for (const session of active) {
    const key = session.projectPath || session.projectDir;
    if (!key) continue;
    const slug = slugFor(session);
    const existing = projects.get(key) ?? {
      name: projectName(key),
      path: session.projectPath,
      activeMinutes: 0,
      sessions: 0,
      filesEdited: 0,
      toolCalls: 0,
      totalCost: slug ? (usage.get(slug)?.totalCost ?? null) : null,
      providers: new Set<string>(),
      timestamps: [],
    };
    existing.sessions += 1;
    existing.filesEdited += session.filesEdited.size;
    existing.toolCalls += session.toolCalls;
    existing.providers.add(session.provider);
    existing.timestamps.push(...session.timestamps);
    projects.set(key, existing);
  }

  const allTimestamps = active.flatMap((session) => session.timestamps);
  const daySpan = activeSpan(allTimestamps, idleMs);
  const sortedDay = [...allTimestamps].sort((left, right) => left - right);
  const totals = dayTotals(report, date);
  const projectCostSum = [...usage.values()].reduce((sum, value) => sum + value.totalCost, 0);

  return {
    date,
    timezone,
    idleMinutes,
    activeMinutes: minutes(daySpan.activeMs),
    blocks: daySpan.blocks,
    spanMinutes: minutes(daySpan.spanMs),
    firstEventAt: sortedDay.length ? new Date(sortedDay[0]).toISOString() : null,
    lastEventAt: sortedDay.length ? new Date(sortedDay[sortedDay.length - 1]).toISOString() : null,
    humanPrompts: active.reduce((sum, session) => sum + session.humanPrompts, 0),
    assistantTurns: active.reduce((sum, session) => sum + session.assistantTurns, 0),
    toolCalls: active.reduce((sum, session) => sum + session.toolCalls, 0),
    toolMix: Object.fromEntries([...day.toolMix.entries()].sort((left, right) => right[1] - left[1])),
    filesEdited: day.filesEdited.size,
    testRuns: day.testRuns,
    providers: [...new Set(active.map((session) => session.provider))].sort(),
    sessions: journalSessions,
    projects: [...projects.values()]
      .map(({ timestamps, providers: used, ...project }) => ({
        ...project,
        providers: [...used].sort(),
        activeMinutes: minutes(activeSpan(timestamps, idleMs).activeMs),
      }))
      .sort((left, right) => right.activeMinutes - left.activeMinutes),
    totalCost: totals?.totalCost ?? projectCostSum,
    totalTokens: totals?.totalTokens ?? 0,
    computedAt: new Date().toISOString(),
  };
}

const TITLE_LENGTH = 64;

// Only Claude names its sessions. For every other agent the opening request is
// the closest thing to a title the transcript has, trimmed to a headline.
function derivedTitle(prompt: string | undefined): string | null {
  if (!prompt) return null;
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= TITLE_LENGTH) return cleaned;
  // Cut on a word boundary so a headline never ends mid-word.
  const cut = cleaned.slice(0, TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// Only Claude's transcripts sit in a directory ccusage also keys its per-project
// rows by. Other agents have no per-project spend to join to.
function slugFor(session: SessionAccumulator): string | null {
  if (session.provider !== "claude") return null;
  if (session.projectDir) return session.projectDir;
  return session.projectPath ? projectSlug(session.projectPath) : null;
}
