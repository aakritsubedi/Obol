import { useMemo, useState } from "react";
import type { Report } from "../api";
import { ProviderLogo, projectColor, providerColor, providerName } from "../providers";
import { displayName, formatCurrency, formatPercent, formatTokens } from "./format";
import {
  aggregateModels,
  aggregateProjects,
  aggregateProviders,
  formatWeekRange,
  type LeaderRow,
  leaderRows,
  normalizeModelName,
  weekToDateRanges,
} from "./weekly";

interface Props {
  report: Report | null;
}

const TOP_COUNT = 3;

// Names render in narrow cards, so cap them by character count instead of
// clipping mid-word with CSS; the full label stays on the title tooltip.
const NAME_LIMIT = 26;

function limitName(value: string): string {
  if (value.length <= NAME_LIMIT) return value;
  return `${value.slice(0, NAME_LIMIT - 1).trimEnd()}…`;
}

function Delta({ ratio }: { ratio: number | null }) {
  if (ratio === null) {
    return <span className="text-[10px] font-medium text-muted">new</span>;
  }
  if (Math.abs(ratio) < 0.0005) {
    return <span className="text-[10px] font-medium text-muted">±0%</span>;
  }
  return (
    <span className={`text-[10px] font-semibold ${ratio > 0 ? "text-over-strong" : "text-ok-strong"}`}>
      {formatPercent(ratio, 1)}
    </span>
  );
}

type LeaderKind = "models" | "projects" | "providers";

function LeaderPanel({ datasets }: { datasets: Record<LeaderKind, LeaderRow[]> }) {
  const [selected, setSelected] = useState<LeaderKind>("models");
  const rows = datasets[selected];
  const showLogo = selected === "providers";
  const isProject = selected === "projects";
  const dotColor = (row: LeaderRow) => (isProject ? projectColor(row.name) : providerColor(row.name));
  const rawName = (row: LeaderRow) => row.name || "Unknown";
  const displayLabel = (row: LeaderRow) => {
    if (selected === "models") return normalizeModelName(rawName(row));
    if (showLogo) return providerName(rawName(row));
    return displayName(rawName(row), "Unknown");
  };
  const renderName = (row: LeaderRow) => limitName(displayLabel(row));
  // Only the podium gets table rows; the long tail becomes compact pills so a
  // busy week cannot stretch the card or squeeze the columns.
  const top = rows.slice(0, TOP_COUNT);
  const rest = rows.slice(TOP_COUNT);
  return (
    <div className="min-h-[300px] min-w-0 rounded-[20px] border border-hairline bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,.04),0_10px_28px_rgba(0,0,0,.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-1 rounded-full border border-hairline bg-panel p-1"
          aria-label="Week ranking dimension"
        >
          {(["models", "projects", "providers"] as LeaderKind[]).map((kind) => (
            <button
              className={`rounded-full px-3 py-1.5 text-[11px] transition ${selected === kind ? "bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-muted hover:text-ink"}`}
              key={kind}
              type="button"
              aria-pressed={selected === kind}
              onClick={() => setSelected(kind)}
            >
              {kind[0].toUpperCase() + kind.slice(1)}
            </button>
          ))}
        </div>
        <span className="whitespace-nowrap text-[10px] text-muted">
          {rows.length} {rows.length === 1 ? "entry" : "entries"} this week
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="grid min-h-[110px] place-items-center text-center text-xs text-muted">
          No usage in this period.
        </p>
      ) : (
        <>
          <table className="mt-4 w-full table-fixed border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-[46%] pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Name
                </th>
                <th className="px-2 pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Cost
                </th>
                <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Tokens
                </th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr className="border-t border-hairline" key={row.name}>
                  <td className="py-2.5 pr-1">
                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                      {showLogo ? (
                        <ProviderLogo agent={row.name} size={14} />
                      ) : (
                        <i
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColor(row) }}
                        />
                      )}
                      <span
                        className="truncate font-medium"
                        title={displayLabel(row) !== rawName(row) ? rawName(row) : displayLabel(row)}
                      >
                        {renderName(row)}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <span className="block whitespace-nowrap tabular-nums">{formatCurrency(row.cost)}</span>
                    <Delta ratio={row.costRatio} />
                  </td>
                  <td
                    className="py-2.5 text-right"
                    title={`${formatTokens(row.inputTokens)} input · ${formatTokens(row.outputTokens)} output · ${formatTokens(row.cacheReadTokens)} cache read`}
                  >
                    <span className="block whitespace-nowrap tabular-nums">{formatTokens(row.tokens)}</span>
                    {row.costRatio !== null && <Delta ratio={row.tokenRatio} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rest.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-hairline pt-3">
              {rest.map((row) => (
                <span
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-panel px-2 py-1 text-[10px]"
                  key={row.name}
                  title={`${displayLabel(row) !== rawName(row) ? `${rawName(row)} · ` : ""}${formatCurrency(row.cost)} · ${formatTokens(row.tokens)} tokens (${formatTokens(row.cacheReadTokens)} cache read)`}
                >
                  {showLogo ? (
                    <ProviderLogo agent={row.name} size={12} />
                  ) : (
                    <i
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor(row) }}
                    />
                  )}
                  <span className="truncate font-medium">{renderName(row)}</span>
                  <span className="whitespace-nowrap tabular-nums text-muted">
                    {formatCurrency(row.cost)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function WeeklyLeaders({ report }: Props) {
  // Week-to-date vs the same weekdays of the previous week. Comparing a
  // partial week against a full one would render every delta green simply
  // because fewer days have elapsed.
  const weeks = useMemo(() => weekToDateRanges(new Date()), []);

  const models = useMemo(() => {
    if (!report) return [];
    return leaderRows(
      aggregateModels(report.daily, weeks.current),
      aggregateModels(report.daily, weeks.previous),
      "cost",
    );
  }, [report, weeks]);
  const providers = useMemo(() => {
    if (!report) return [];
    return leaderRows(
      aggregateProviders(report.daily, weeks.current),
      aggregateProviders(report.daily, weeks.previous),
      "cost",
    );
  }, [report, weeks]);
  const projects = useMemo(() => {
    if (!report) return [];
    return leaderRows(
      aggregateProjects(report.projects, weeks.current),
      aggregateProjects(report.projects, weeks.previous),
      "cost",
    );
  }, [report, weeks]);

  if (!report || (models.length === 0 && providers.length === 0 && projects.length === 0)) {
    return null;
  }

  return (
    <section className="border-t border-hairline py-12" id="week-leaders" aria-labelledby="week-leaders-heading">
      <div className="mb-[22px] flex items-start justify-between gap-[18px] max-[760px]:flex-wrap">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="week-leaders-heading"
          >
            Week to date · Sun – Sat
          </div>
          <h2 className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[17px] font-bold tracking-[-0.025em]">
            Week of {formatWeekRange(weeks.current)}
            <span
              className="rounded-full bg-wash px-2 py-0.5 text-[10px] font-semibold text-subtle"
              title="Only the elapsed days of this calendar week are counted, and the comparison covers those same weekdays last week."
            >
              Day {weeks.dayIndex + 1} of 7
            </span>
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Ranked by cost vs {formatWeekRange(weeks.previous)} (same days)
          </p>
        </div>
      </div>
      <LeaderPanel datasets={{ models, projects, providers }} />
    </section>
  );
}
