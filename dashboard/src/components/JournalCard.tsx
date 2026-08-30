import { useEffect, useState } from "react";
import type { DayJournal } from "../api";
import { formatCurrency, formatDuration } from "./format";
import { BRANCH, CHECK, CHEVRON_DOWN, CHEVRON_UP, CLOCK, COPY, FOLDER, Icon } from "./icons";
import {
  clipboardSummary,
  type DayOption,
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

interface Props {
  journal: DayJournal | null;
  options: DayOption[];
  date: string;
  onDateChange: (date: string) => void;
  loading?: boolean;
}

// Apple Notes marks a completed checklist item with a filled amber circle and a
// check. Every task listed here is work already done, so they all read as ticked.
function Tick() {
  return (
    <span
      className="mt-[3px] grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-note-accent"
      aria-hidden="true"
    >
      <svg viewBox="0 0 12 12" className="h-[9px] w-[9px]" fill="none">
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.8"
          stroke="var(--note-paper)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function TaskRow({ task }: { task: Task }) {
  // Every list here can be absent when an older daemon answers a newer
  // dashboard, so each one is defaulted rather than trusted.
  const tools = toolShares(task.toolMix, 3);
  const prompts = task.prompts ?? [];
  const filesEdited = task.filesEdited ?? [];
  const tags = workTags(task);
  // A task reads as three quiet lines — what it was, where, what it produced —
  // and only opens up for the prompts and the file list on request.
  const [open, setOpen] = useState(false);
  const [allFiles, setAllFiles] = useState(false);

  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <Tick />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="group flex w-full cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-0 bg-transparent p-0 text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="text-[15px] font-medium leading-snug text-note-ink">{task.title}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium tabular-nums text-note-subtle transition-colors group-hover:text-note-ink">
            {formatDuration(task.activeMinutes)}
            <span className="inline-flex transition-transform" data-open={open}>
              <Icon path={open ? CHEVRON_UP : CHEVRON_DOWN} className="h-3 w-3 shrink-0 opacity-70" />
            </span>
          </span>
        </button>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-note-muted">
          {task.providers.map((provider) => (
            <span
              key={provider}
              className="rounded bg-note-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-note-subtle"
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
          <span className="inline-flex items-center gap-1">
            <Icon path={CLOCK} label="Time" className="h-3 w-3 shrink-0 opacity-70" />
            {sessionRange(task)}
          </span>
        </div>

        {(filesEdited.length > 0 || tools.length > 0 || tags.length > 0) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-note-muted">
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
                  <li key={prompt} className="flex gap-2 text-[13px] leading-snug text-note-subtle">
                    <span className="text-note-muted" aria-hidden="true">
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
                      className="truncate font-mono text-[11.5px] leading-relaxed text-note-muted"
                      title={file}
                    >
                      {relativeFile(file, task.projectPath)}
                    </li>
                  ))}
                </ul>
                {filesEdited.length > VISIBLE_FILES && (
                  <button
                    type="button"
                    className="mt-1 border-0 bg-transparent p-0 text-[12px] text-note-accent hover:underline"
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

export default function JournalCard({ journal, options, date, onDateChange, loading }: Props) {
  const [copied, setCopied] = useState(false);
  const lines = journal ? narrative(journal) : [];
  const tasks = journal ? groupTasks(journal) : [];

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

  // Apple Notes closes an entry with hashtags, so the day signs off with the
  // projects it touched and the kinds of work they involved. Capped at five,
  // projects first — they arrive ordered by how much of the day they took.
  const hashtags = [
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

      <div className="mx-auto overflow-hidden rounded-card border border-note-edge bg-note-paper shadow-pop">
        <div className="px-8 pb-8 pt-6 max-[560px]:px-5 max-[560px]:pb-6">
          {!journal ? (
            <p className="py-6 text-center text-[14px] text-note-muted">
              {loading ? "Loading…" : "No tasks recorded."}
            </p>
          ) : (
            <>
              <p className="text-center text-[11px] text-note-muted">{noteStamp(journal)}</p>

              <div className="mt-3 flex flex-col gap-1.5">
                {lines.map((line) => (
                  <p key={line} className="text-[15px] leading-[1.5] text-note-subtle">
                    {line}
                  </p>
                ))}
              </div>

              {tasks.length > 0 && (
                <>
                  <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-note-muted">
                    Completed
                  </p>
                  <ul className="mt-1 flex flex-col divide-y divide-note-rule">
                    {tasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </ul>

                  {hashtags.length > 0 && (
                    <p className="mt-6 flex flex-wrap gap-x-2.5 gap-y-1 text-[14px] text-note-accent">
                      {hashtags.map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </p>
                  )}

                  <p className="mt-4 text-[11px] leading-snug text-note-muted">
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
