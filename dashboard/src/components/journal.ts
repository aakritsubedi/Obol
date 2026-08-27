import type { DayJournal, JournalSession } from "../api";
import { formatDuration } from "./format";

export interface Efficiency {
  costPerFile: number | null;
  costPerActiveHour: number | null;
  toolCallsPerPrompt: number | null;
}

// Every ratio is null rather than zero when its denominator is missing, so the
// card can show an em dash instead of implying a real measurement of zero.
export function efficiency(journal: DayJournal): Efficiency {
  const activeHours = journal.activeMinutes / 60;
  return {
    costPerFile: journal.filesEdited > 0 ? journal.totalCost / journal.filesEdited : null,
    costPerActiveHour: activeHours > 0 ? journal.totalCost / activeHours : null,
    toolCallsPerPrompt: journal.humanPrompts > 0 ? journal.toolCalls / journal.humanPrompts : null,
  };
}

export function formatClock(iso: string | null, locale?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function sessionRange(
  session: Pick<JournalSession, "startedAt" | "endedAt">,
  locale?: string,
): string {
  return `${formatClock(session.startedAt, locale)} – ${formatClock(session.endedAt, locale)}`;
}

export function sessionLabel(session: Pick<JournalSession, "id" | "title">): string {
  // Ids are namespaced as "<provider>:<id>", so the prefix is dropped before
  // shortening — otherwise the fallback reads "Session codex:ro".
  const bare = session.id.includes(":") ? session.id.slice(session.id.indexOf(":") + 1) : session.id;
  return session.title?.trim() || `Session ${bare.slice(0, 8)}`;
}

// One task is one continuous stretch of work, however many agent sessions it
// took to get through. Agents split a single effort across sessions constantly:
// one ends and the next picks up the same work seconds later under a fresh id,
// a new title and sometimes a different checkout.
export interface Task {
  id: string;
  title: string;
  project: string;
  projectPath: string;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string;
  activeMinutes: number;
  humanPrompts: number;
  assistantTurns: number;
  toolCalls: number;
  filesEdited: string[];
  models: string[];
  prompts: string[];
  toolMix: Record<string, number>;
  totalCost: number | null;
  providers: string[];
}

const startMs = (session: Pick<JournalSession, "startedAt">): number => Date.parse(session.startedAt) || 0;
const endMs = (session: Pick<JournalSession, "startedAt" | "endedAt">): number =>
  Date.parse(session.endedAt) || startMs(session);

function sameProject(left: JournalSession, right: JournalSession): boolean {
  const one = left.projectPath || left.project;
  const other = right.projectPath || right.project;
  return Boolean(one) && one === other;
}

// Sessions merge into one task when the next picks up within the idle
// threshold of the previous one ending — a handoff, whatever project each
// claims — or when they overlap on the same project. Sessions that overlap on
// different projects stay apart: parallel work in two checkouts is
// multitasking, not one task.
export function groupTasks(journal: DayJournal): Task[] {
  const idleMinutes = journal.idleMinutes > 0 ? journal.idleMinutes : 15;
  const idleMs = idleMinutes * 60_000;
  const ordered = [...(journal.sessions ?? [])].sort((left, right) => startMs(left) - startMs(right));

  const groups: JournalSession[][] = [];
  for (const session of ordered) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    if (previous) {
      const gap = startMs(session) - endMs(previous);
      const continues = gap >= 0 ? gap <= idleMs : sameProject(previous, session);
      if (continues) {
        group.push(session);
        continue;
      }
    }
    groups.push([session]);
  }

  return groups.map((members) => {
    const first = members[0];
    const named = members.find((session) => session.title?.trim());
    const toolMix: Record<string, number> = {};
    const files = new Set<string>();
    const models = new Set<string>();
    const providers: string[] = [];
    let activeMinutes = 0;
    let humanPrompts = 0;
    let assistantTurns = 0;
    let toolCalls = 0;
    let totalCost = 0;
    let costKnown = false;

    for (const session of members) {
      activeMinutes += session.activeMinutes ?? 0;
      humanPrompts += session.humanPrompts ?? 0;
      assistantTurns += session.assistantTurns ?? 0;
      toolCalls += session.toolCalls ?? 0;
      for (const path of session.filesEdited ?? []) files.add(path);
      for (const model of session.models ?? []) models.add(model);
      for (const [name, count] of Object.entries(session.toolMix ?? {})) {
        toolMix[name] = (toolMix[name] ?? 0) + (typeof count === "number" ? count : 0);
      }
      if (typeof session.totalCost === "number") {
        totalCost += session.totalCost;
        costKnown = true;
      }
      if (session.provider && !providers.includes(session.provider)) providers.push(session.provider);
    }

    const last = members.reduce((latest, session) => (endMs(session) > endMs(latest) ? session : latest));
    return {
      id: first.id,
      title: sessionLabel(named ?? first),
      project: first.project,
      projectPath: first.projectPath,
      gitBranch: first.gitBranch ?? null,
      startedAt: first.startedAt,
      endedAt: last.endedAt,
      activeMinutes,
      humanPrompts,
      assistantTurns,
      toolCalls,
      filesEdited: [...files].sort(),
      models: [...models].sort(),
      // An agent replaying the same instruction into a successor session adds
      // nothing a reader needs twice.
      prompts: [...new Set(members.flatMap((session) => session.prompts ?? []))],
      toolMix: Object.fromEntries(Object.entries(toolMix).sort((left, right) => right[1] - left[1])),
      totalCost: costKnown ? totalCost : null,
      providers,
    };
  });
}

// A file reads best relative to the project it belongs to. Anything outside the
// project falls back to its last two segments so the row never shows an
// absolute path stretching off the card.
export function relativeFile(path: string, projectPath?: string): string {
  if (projectPath && path.startsWith(`${projectPath}/`)) return path.slice(projectPath.length + 1);
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}

// Listed in the order a reader scans them, not the order they were found, so
// two tasks touching the same kinds of file always read the same way.
const WORK_ORDER = ["UI", "logic", "tests", "styles", "config", "docs"] as const;

function fileCategory(path: string): (typeof WORK_ORDER)[number] | null {
  const name = path.split("/").pop() || "";
  if (/\.(test|spec)\.[jt]sx?$/.test(name) || /(^|\/)(__tests__|tests?)\//.test(path)) return "tests";
  if (/\.(md|mdx|txt)$/.test(name)) return "docs";
  if (/\.(css|scss|sass|less)$/.test(name)) return "styles";
  if (/\.config\.|\.(json|ya?ml|toml|ini|plist|entitlements)$/.test(name)) return "config";
  if (/\.(tsx|jsx|vue|svelte)$/.test(name)) return "UI";
  if (/\.(ts|js|mjs|cjs|swift|kt|java|py|go|rs|rb|php|sh)$/.test(name)) return "logic";
  return null;
}

// What kind of work a task was, inferred from the files it changed. This is a
// description of the diff's shape, not of intent — the prompts carry intent.
export function workTags(session: { filesEdited?: string[] }): string[] {
  const found = new Set<string>();
  for (const path of session.filesEdited ?? []) {
    const category = fileCategory(path);
    if (category) found.add(category);
  }
  return WORK_ORDER.filter((tag) => found.has(tag));
}

export interface ToolShare {
  name: string;
  count: number;
  share: number;
}

// The mix is long-tailed: a handful of tools dominate and the rest are noise.
// Anything past the cut is rolled into a single "other" row so the bar still
// sums to the real total.
// The mix is absent entirely when an older daemon is still running against a
// newer dashboard, so this must degrade to "no tools" rather than throwing —
// one missing field used to take the whole page down.
export function toolShares(toolMix: Record<string, number> | null | undefined, limit = 5): ToolShare[] {
  const entries = Object.entries(toolMix ?? {})
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort((left, right) => right[1] - left[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return [];

  const top = entries.slice(0, limit);
  const rest = entries.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  const shares = top.map(([name, count]) => ({ name, count, share: count / total }));
  if (rest > 0) shares.push({ name: "other", count: rest, share: rest / total });
  return shares;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function noteDate(journal: DayJournal): Date | null {
  const date = new Date(`${journal.date}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

// The weekday alone titles the note, the way a hand-written entry would.
export function noteTitle(journal: DayJournal, locale?: string): string {
  const date = noteDate(journal);
  if (!date) return journal.date;
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
}

// Apple Notes stamps each note with when it was last touched, not when it was
// created, so this follows the day's last recorded event.
export function noteStamp(journal: DayJournal, locale?: string): string {
  const date = noteDate(journal);
  const day = date ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date) : journal.date;
  if (!journal.lastEventAt) return day;
  const last = new Date(journal.lastEventAt);
  if (Number.isNaN(last.valueOf())) return day;
  return `${day} at ${new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(last)}`;
}

// The summary line: how long the day ran and what came out of it. Cost is
// deliberately absent — it belongs in a footnote, not the update.
export function narrative(journal: DayJournal, locale?: string): string[] {
  const sessions = journal.sessions ?? [];
  if (sessions.length === 0) return ["Nothing was recorded on this day."];

  // Tasks, not sessions: a day that took three agent sessions to get one thing
  // done reads as one task, matching how the card lists the work.
  const taskCount = groupTasks(journal).length;

  const lines: string[] = [];
  const window =
    journal.firstEventAt && journal.lastEventAt
      ? `, ${formatClock(journal.firstEventAt, locale)} to ${formatClock(journal.lastEventAt, locale)}`
      : "";
  lines.push(
    `${formatDuration(journal.activeMinutes)} of hands-on work across ${plural(taskCount, "task")} in ${plural(journal.blocks, "sitting")}${window}.`,
  );

  const output = [
    journal.filesEdited > 0 ? plural(journal.filesEdited, "file") : "",
    journal.toolCalls > 0 ? plural(journal.toolCalls, "tool call") : "",
    journal.testRuns > 0 ? plural(journal.testRuns, "test run") : "",
  ].filter(Boolean);
  if (output.length > 0) {
    lines.push(`${output.join(", ")}.`.replace(/^./, (letter) => letter.toUpperCase()));
  }

  return lines;
}

// The clipboard gets tasks grouped by project, one line per session. File lists
// and cost stay out — they belong to the card, not to a pasted task list.
export function clipboardSummary(journal: DayJournal, locale?: string): string {
  const date = noteDate(journal);
  const lines = [
    date
      ? new Intl.DateTimeFormat(locale, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(date)
      : journal.date,
  ];

  const sessions = journal.sessions ?? [];
  if (sessions.length === 0) return [...lines, "", "Nothing was recorded."].join("\n");

  // The card's opening sentence, so a pasted summary reads like the note.
  const opening = narrative(journal, locale)[0];
  if (opening) lines.push(opening);

  // Merged tasks, grouped under the project each task started in. Insertion
  // order follows start times, so projects read chronologically rather than by
  // however much they happened to cost.
  const groups = new Map<string, { name: string; items: string[] }>();
  for (const task of groupTasks(journal)) {
    const key = task.projectPath || task.project;
    const group = groups.get(key) ?? { name: task.project || key, items: [] };
    group.items.push(
      `• ${task.title} · ${sessionRange(task, locale)} · ${formatDuration(task.activeMinutes)}`,
    );
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    lines.push("", group.name, ...group.items);
  }
  return lines.join("\n");
}

export interface DayOption {
  value: string;
  label: string;
  weekday: string;
  isToday: boolean;
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// The picker covers the current week only, Sunday through today — a day's
// tasks look back over this week, never forward and never into the last one. Dates
// are built in the viewer's own timezone so "today" matches their clock.
export function weekOptions(today: Date, locale?: string): DayOption[] {
  const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = localDateKey(anchor);
  const options: DayOption[] = [];

  for (let offset = anchor.getDay(); offset >= 0; offset -= 1) {
    const date = new Date(anchor);
    date.setDate(date.getDate() - offset);
    const value = localDateKey(date);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
    const isToday = value === todayKey;
    const isYesterday = offset === 1;
    options.push({
      value,
      label: isToday ? "Today" : isYesterday ? "Yesterday" : weekday,
      weekday,
      isToday,
    });
  }

  return options;
}
