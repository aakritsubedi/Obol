import type { Summary } from "../api";
import { formatCurrency, formatTokens } from "./format";

export interface WeekSummary {
  totalCost: number;
  totalTokens: number;
  activeDays: number;
  averageDaily: number;
}

interface Props {
  summary: Summary;
  week: WeekSummary;
}

export default function TodayCard({ summary, week }: Props) {
  const modelCount = summary.today.modelsUsed?.length || 0;

  return (
    <section
      className="min-w-0 rounded-[24px] border border-hairline bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,.04),0_14px_36px_rgba(0,0,0,.045)] max-[760px]:rounded-[20px] max-[760px]:p-[22px]"
      aria-labelledby="today-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="today-heading"
          >
            Today
          </div>
          <p className="mt-1 text-xs text-muted">Current day spend</p>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${summary.stale ? "text-warn-strong" : "text-ok-strong"}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${summary.stale ? "bg-warn" : "bg-ok"}`} />
          {summary.stale ? "Cached" : "Live"}
        </div>
      </div>

      <div className="mt-5 text-[clamp(58px,7vw,92px)] font-bold tabular-nums leading-[0.92] tracking-[-0.055em]">
        {formatCurrency(summary.today.totalCost)}
      </div>
      <p className="mt-3 text-xs text-muted">
        {summary.agents.length} providers · {modelCount} models
      </p>

      <div className="mt-8 border-t border-hairline pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-[-0.015em]">This week</div>
            <p className="mt-1 text-xs text-muted">A quick view of the current week</p>
          </div>
          <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-subtle">
            {week.activeDays
              ? `${week.activeDays} active ${week.activeDays === 1 ? "day" : "days"}`
              : "No activity yet"}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 min-[540px]:grid-cols-4">
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Spend</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {formatCurrency(week.totalCost)}
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Daily average</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {formatCurrency(week.averageDaily)}
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Active days</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {week.activeDays}/7
            </strong>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] text-muted">Tokens</span>
            <strong className="mt-1.5 block text-base font-semibold tabular-nums tracking-[-0.025em]">
              {formatTokens(week.totalTokens)}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
