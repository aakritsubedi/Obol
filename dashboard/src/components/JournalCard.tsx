import { useEffect, useState } from "react";
import type { DayJournal } from "../api";
import { formatCurrency, formatDuration } from "./format";
import {
  clipboardSummary,
  type DayOption,
  groupTasks,
  type Task,
  narrative,
  noteStamp,
  relativeFile,
  sessionRange,
  toolShares,
  workTags,
} from "./journal";

const VISIBLE_FILES = 4;

interface Props {
  journal: DayJournal | null;
  options: DayOption[];
  date: string;
  onDateChange: (date: string) => void;
  loading?: boolean;
}

function Icon({ path, label }: { path: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3 shrink-0 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d={path} />
    </svg>
  );
}

const FOLDER =
  "M1.9 4.1A1.2 1.2 0 0 1 3.1 3h2.6l1.3 1.6h5.9A1.2 1.2 0 0 1 14.1 5.8v5.4a1.2 1.2 0 0 1-1.2 1.2H3.1a1.2 1.2 0 0 1-1.2-1.2Z";
const BRANCH =
  "M4.5 3.6v8.8M4.5 3.6a1.4 1.4 0 1 0 0-.1ZM4.5 12.4a1.4 1.4 0 1 0 0 .1ZM11.5 5a1.4 1.4 0 1 0 0-.1ZM11.5 6.4v.9a2.6 2.6 0 0 1-2.6 2.6H4.5";
const CLOCK = "M8 4.2V8l2.4 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z";
const COPY =
  "M11.1 3.9H4.9A1.4 1.4 0 0 0 3.5 5.3v6.2M4.9 6.1h6.2a1.4 1.4 0 0 1 1.4 1.4v6.2a1.4 1.4 0 0 1-1.4 1.4H4.9a1.4 1.4 0 0 1-1.4-1.4V7.5a1.4 1.4 0 0 1 1.4-1.4Z";
const CHECK = "M3.2 8.4 6.4 11.5 12.8 4.9";
const CHEVRON_DOWN = "M4.5 6.2 8 9.7l3.5-3.5";
const CHEVRON_UP = "M4.5 9.7 8 6.2l3.5 3.5";

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
              <Icon path={open ? CHEVRON_UP : CHEVRON_DOWN} />
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
            <Icon path={FOLDER} label="Project" />
            {task.project}
          </span>
          {task.gitBranch && (
            <span className="inline-flex items-center gap-1">
              <Icon path={BRANCH} label="Branch" />
              {task.gitBranch}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Icon path={CLOCK} label="Time" />
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
    <section className="border-t border-dashed border-hairline pb-12 pt-10" aria-labelledby="journal-heading">
      <div className="mb-5 flex items-start justify-between gap-4 max-[560px]:flex-wrap max-[560px]:gap-y-3">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="journal-heading"
          >
            Tasks
          </div>
          <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">
            {options.find((option) => option.value === (journal?.date ?? date))?.weekday ??
              journal?.date ??
              date}
          </h2>
        </div>
        <div className="flex items-center gap-2 max-[560px]:w-full max-[560px]:justify-between">
          <button
            type="button"
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-card py-2 pr-3 pl-2.5 text-[11px] font-medium outline-none transition-colors hover:text-ink focus-visible:border-subtle focus-visible:ring-4 focus-visible:ring-wash disabled:pointer-events-none disabled:opacity-50 ${
              copied ? "text-ink" : "text-subtle"
            }`}
            onClick={() => void handleCopy()}
            disabled={!journal}
            title={copied ? "Copied" : "Copy tasks grouped by project"}
          >
            <Icon path={copied ? CHECK : COPY} />
            {copied ? "Copied" : "Copy"}
          </button>
          <span className="relative inline-flex items-center">
            <select
              className="cursor-pointer appearance-none truncate rounded-full border border-hairline bg-card py-2 pr-8 pl-3 text-[11px] text-ink outline-none transition-colors hover:border-subtle focus-visible:border-subtle focus-visible:ring-4 focus-visible:ring-wash"
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
              <Icon path={CHEVRON_DOWN} />
            </span>
          </span>
        </div>
      </div>

      <div className="mx-auto overflow-hidden rounded-[10px] border border-note-edge bg-note-paper shadow-[0_1px_2px_rgba(0,0,0,.05),0_18px_44px_-16px_rgba(0,0,0,.22)]">
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
