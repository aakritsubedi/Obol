import { useEffect, useState } from "react";
import type { DayJournal } from "../api";
import { formatCurrency, formatDuration } from "./format";
import { BRANCH, CHECK, CHEVRON_DOWN, CHEVRON_UP, CLOCK, COPY, FOLDER, Icon, LAYERS } from "./icons";
import {
  clipboardSummary,
  type DayOption,
  formatClock,
  groupTasks,
  narrative,
  noteStamp,
  relativeFile,
  sessionRange,
  type Task,
  toolShares,
  workTags,
} from "./journal";
import SectionHeader from "./SectionHeader";
import { buttonGhost, sectionShell } from "./ui";

const VISIBLE_FILES = 4;

type TimelineEntry = { kind: "task"; task: Task } | { kind: "gap"; id: string; minutes: number };

function taskStart(task: Task): number {
  const value = Date.parse(task.startedAt);
  return Number.isFinite(value) ? value : 0;
}

function taskEnd(task: Task): number {
  const value = Date.parse(task.endedAt);
  return Number.isFinite(value) ? value : taskStart(task);
}

/** Keep the rail newest-first and make idle stretches visible between tasks. */
function timelineEntries(tasks: Task[]): TimelineEntry[] {
  const ordered = [...tasks].sort((left, right) => taskStart(right) - taskStart(left));
  return ordered.flatMap((task, index) => {
    if (index === 0) return [{ kind: "task", task } satisfies TimelineEntry];

    const previous = ordered[index - 1];
    const gap = taskStart(previous) - taskEnd(task);
    const entries: TimelineEntry[] = [];
    if (gap > 0) {
      entries.push({
        kind: "gap",
        id: `gap-${task.id}-${previous.id}`,
        minutes: gap / 60_000,
      });
    }
    entries.push({ kind: "task", task });
    return entries;
  });
}

interface Props {
  journal: DayJournal | null;
  options: DayOption[];
  date: string;
  onDateChange: (date: string) => void;
  loading?: boolean;
}

function TaskRow({ task, last }: { task: Task; last: boolean }) {
  // Every list here can be absent when an older daemon answers a newer
  // dashboard, so each one is defaulted rather than trusted.
  const tools = toolShares(task.toolMix, 3);
  const prompts = task.prompts ?? [];
  const filesEdited = task.filesEdited ?? [];
  const tags = workTags(task);
  // A task reads as one point on the rail — what it was, where, and what it
  // produced — and only opens up for prompts and files on request.
  const [open, setOpen] = useState(false);
  const [allFiles, setAllFiles] = useState(false);

  return (
    <li className="relative grid grid-cols-[4.5rem_1rem_minmax(0,1fr)] gap-x-3 pb-10 last:pb-0 max-[560px]:grid-cols-[1rem_minmax(0,1fr)] max-[560px]:gap-x-3">
      {!last && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[5.75rem] top-3 border-l border-hairline max-[560px]:left-[0.5rem]"
        />
      )}

      <div className="pt-0.5 text-right text-[10px] leading-tight tabular-nums text-muted max-[560px]:hidden">
        <span className="block">{formatClock(task.startedAt)}</span>
        <span className="mt-1 block">{formatClock(task.endedAt)}</span>
      </div>

      <div className="relative z-10 flex justify-center">
        <span
          aria-hidden="true"
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-ink bg-card ring-2 ring-card"
        />
      </div>

      <div className="min-w-0">
        <button
          type="button"
          className="group flex w-full cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-0 bg-transparent p-0 text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="text-[15px] font-medium leading-snug text-ink">{task.title}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium tabular-nums text-subtle transition-colors group-hover:text-ink">
            {formatDuration(task.activeMinutes)}
            <span className="inline-flex transition-transform" data-open={open}>
              <Icon path={open ? CHEVRON_UP : CHEVRON_DOWN} className="h-3 w-3 shrink-0 opacity-70" />
            </span>
          </span>
        </button>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {task.providers.map((provider) => (
            <span
              key={provider}
              className="rounded bg-wash px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-subtle"
            >
              {provider}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <Icon path={FOLDER} label="Project" className="h-3 w-3 shrink-0 opacity-70" />
            {task.project}
          </span>
          {task.gitBranch && (
            <span className="inline-flex items-center gap-1">
              <Icon path={BRANCH} label="Branch" className="h-3 w-3 shrink-0 opacity-70" />
              {task.gitBranch}
            </span>
          )}
          {task.sessionCount > 1 && (
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              title="Separate agent sessions merged into one task because they continued the same work in this project"
            >
              <Icon path={LAYERS} label="Sessions" className="h-3 w-3 shrink-0 opacity-70" />
              {task.sessionCount} sessions
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted min-[561px]:hidden">
          <span className="inline-flex items-center gap-1">
            <Icon path={CLOCK} label="Time" className="h-3 w-3 shrink-0 opacity-70" />
            {sessionRange(task)}
          </span>
        </div>

        {(filesEdited.length > 0 || tools.length > 0 || tags.length > 0) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            {filesEdited.length > 0 && (
              <span className="tabular-nums">
                {filesEdited.length} {filesEdited.length === 1 ? "file" : "files"}
              </span>
            )}
            {tags.length > 0 && <span>· {tags.join(", ")}</span>}
            {tools.map((tool) => (
              <span key={tool.name} className="tabular-nums">
                · {tool.name} {tool.count}
              </span>
            ))}
          </p>
        )}

        {open && (
          <>
            {prompts.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {prompts.map((prompt) => (
                  <li key={prompt} className="flex gap-2 text-[13px] leading-snug text-subtle">
                    <span className="text-muted" aria-hidden="true">
                      –
                    </span>
                    <span className="min-w-0">{prompt}</span>
                  </li>
                ))}
              </ul>
            )}

            {filesEdited.length > 0 && (
              <>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {(allFiles ? filesEdited : filesEdited.slice(0, VISIBLE_FILES)).map((file) => (
                    <li
                      key={file}
                      className="truncate font-mono text-[11.5px] leading-relaxed text-muted"
                      title={file}
                    >
                      {relativeFile(file, task.projectPath)}
                    </li>
                  ))}
                </ul>
                {filesEdited.length > VISIBLE_FILES && (
                  <button
                    type="button"
                    className="mt-1 border-0 bg-transparent p-0 text-[12px] text-subtle hover:text-ink hover:underline"
                    onClick={() => setAllFiles((value) => !value)}
                    aria-expanded={allFiles}
                  >
                    {allFiles ? "Show less" : `Show ${filesEdited.length - VISIBLE_FILES} more`}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function TimelineGap({ minutes, last }: { minutes: number; last: boolean }) {
  return (
    <li className="relative grid grid-cols-[4.5rem_1rem_minmax(0,1fr)] items-center gap-x-3 py-3 max-[560px]:grid-cols-[1rem_minmax(0,1fr)] max-[560px]:gap-x-3">
      {!last && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[5.75rem] top-0 border-l border-dashed border-warn opacity-50 max-[560px]:left-[0.5rem]"
        />
      )}

      <span aria-hidden="true" className="max-[560px]:hidden" />

      <span
        aria-hidden="true"
        className="relative z-10 flex h-4 w-4 items-center justify-center rounded-full border border-warn bg-card text-[11px] leading-none text-warn opacity-70"
      >
        …
      </span>

      <span className="min-w-0 text-[11px] italic text-warn">Idle · {formatDuration(minutes)}</span>
    </li>
  );
}

export default function JournalCard({ journal, options, date, onDateChange, loading }: Props) {
  const [copied, setCopied] = useState(false);
  const lines = journal ? narrative(journal) : [];
  const tasks = journal ? groupTasks(journal) : [];
  const timeline = timelineEntries(tasks);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy(): Promise<void> {
    if (!journal) return;
    try {
      await navigator.clipboard.writeText(clipboardSummary(journal));
      setCopied(true);
    } catch (reason) {
      console.error("Could not copy the tasks", reason);
    }
  }

  // The timeline closes with the projects it touched and the kinds of work they
  // involved. Capped at five, projects first — they arrive ordered by how much
  // of the day they took.
  const timelineTags = [
    ...new Set([
      ...(journal?.projects ?? []).map((project) => project.name),
      ...tasks.flatMap((task) => workTags(task)),
    ]),
  ]
    .filter(Boolean)
    .slice(0, 5);

  return (
    <section className={sectionShell} aria-labelledby="journal-heading">
      <SectionHeader
        eyebrow="Tasks"
        id="journal-heading"
        title={
          options.find((option) => option.value === (journal?.date ?? date))?.weekday ?? journal?.date ?? date
        }
        actions={
          <>
            <button
              type="button"
              className={buttonGhost}
              onClick={() => void handleCopy()}
              disabled={!journal}
              title={copied ? "Copied" : "Copy tasks grouped by project"}
            >
              <Icon path={copied ? CHECK : COPY} className="h-3 w-3 shrink-0" />
              {copied ? "Copied" : "Copy"}
            </button>
            <span className="relative inline-flex items-center">
              <select
                className="h-8 cursor-pointer appearance-none truncate rounded-full border border-hairline bg-card pl-3 pr-8 text-[11px] text-ink outline-none transition hover:border-subtle focus-visible:border-subtle focus-visible:ring-4 focus-visible:ring-wash"
                value={date}
                onChange={(event) => onDateChange(event.target.value)}
                aria-label="Show tasks for"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 inline-flex text-muted">
                <Icon path={CHEVRON_DOWN} className="h-3 w-3 shrink-0 opacity-70" />
              </span>
            </span>
          </>
        }
      />

      <div className="mx-auto">
        <div>
          {!journal ? (
            <p className="py-6 text-center text-[14px] text-muted">
              {loading ? "Loading…" : "No tasks recorded."}
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-4 text-[11px] text-muted">
                <span className="min-w-0">{noteStamp(journal)}</span>
                <span className="shrink-0 text-right tabular-nums">
                  {formatDuration(journal.activeMinutes)} active
                  {journal.blocks > 0
                    ? ` · ${journal.blocks} ${journal.blocks === 1 ? "sitting" : "sittings"}`
                    : ""}
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                {lines.map((line) => (
                  <p key={line} className="text-[15px] leading-[1.5] text-subtle">
                    {line}
                  </p>
                ))}
              </div>

              {tasks.length > 0 && (
                <>
                  <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Activity timeline
                  </p>
                  <ol className="mt-3" aria-label="Reverse chronological activity timeline">
                    {timeline.map((entry, index) =>
                      entry.kind === "task" ? (
                        <TaskRow key={entry.task.id} task={entry.task} last={index === timeline.length - 1} />
                      ) : (
                        <TimelineGap
                          key={entry.id}
                          minutes={entry.minutes}
                          last={index === timeline.length - 1}
                        />
                      ),
                    )}
                  </ol>

                  {timelineTags.length > 0 && (
                    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                      <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Touched
                      </span>
                      {timelineTags.map((tag) => (
                        <span key={tag} className="rounded-full bg-wash px-2 py-1 text-[11px] text-subtle">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="mt-4 text-[11px] leading-snug text-muted">
                    Pauses under {journal.idleMinutes} minutes count as continuous work
                    {journal.totalCost > 0 ? ` · ${formatCurrency(journal.totalCost)} spent` : ""}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
