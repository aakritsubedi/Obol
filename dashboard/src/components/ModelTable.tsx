import { useEffect, useMemo, useState } from "react";
import type { Report } from "../api";
import { providerColor } from "./CostChart";
import { displayName, formatCurrency, formatTokens } from "./format";
import {
  type AggregatedModel,
  aggregateByProvider,
  aggregateModels,
  modelName,
  modelRowsFor,
  type ProviderGroup,
  periodHasModelData,
  type ReportPeriod,
} from "./totals";

interface Props {
  report: Report | null;
}

const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Week" },
  { value: "monthly", label: "Month" },
];

export default function ModelTable({ report }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [query, setQuery] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(() => new Set());
  const availablePeriods = useMemo(
    () => (report ? periodOptions.filter((option) => periodHasModelData(report, option.value)) : []),
    [report],
  );
  const activePeriod = availablePeriods.some((option) => option.value === period)
    ? period
    : availablePeriods[0]?.value || "daily";
  useEffect(() => setExpandedAgents(new Set()), [activePeriod]);
  const groups = useMemo(
    () => (report ? aggregateByProvider(report, activePeriod) : []),
    [activePeriod, report],
  );
  const flatModels = useMemo(
    () => (report ? aggregateModels(report, activePeriod) : []),
    [activePeriod, report],
  );
  const search = query.trim().toLowerCase();
  const hasGroups = groups.length > 0;
  const allModels = hasGroups ? groups.flatMap((group) => group.models) : flatModels;
  const visibleModels = allModels.filter((model) => modelName(model).toLowerCase().includes(search));
  const periodCost = report
    ? modelRowsFor(report, activePeriod).reduce((sum, row) => sum + row.totalCost, 0)
    : 0;
  const visibleCost = visibleModels.reduce((sum, model) => sum + model.totalCost, 0);
  const denominator = periodCost > 0 ? periodCost : visibleCost;
  const periodLabel = periodOptions.find((option) => option.value === activePeriod)?.label;

  function toggleAgent(agent: string) {
    setExpandedAgents((current) => {
      const next = new Set(current);
      if (next.has(agent)) next.delete(agent);
      else next.add(agent);
      return next;
    });
  }

  return (
    <section className="border-t border-hairline py-8" aria-labelledby="models-heading">
      <div className="mb-5 flex items-start justify-between gap-4 max-[760px]:flex-wrap">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="models-heading"
          >
            Models
          </div>
          <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">
            {visibleModels.length} of {allModels.length} models{" "}
            <span className="text-[11px] font-medium tracking-normal text-muted">{periodLabel}</span>
          </h2>
        </div>
        {allModels.length > 0 && (
          <div className="flex items-center gap-2.5 max-[760px]:w-full max-[760px]:justify-between">
            {availablePeriods.length > 1 && (
              <div
                className="flex gap-0.5 rounded-full border border-hairline bg-panel p-[3px]"
                aria-label="Model time range"
              >
                {availablePeriods.map((option) => (
                  <button
                    className={`rounded-full border-0 px-2.5 py-1.5 text-[11px] ${activePeriod === option.value ? "bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "bg-transparent text-muted"}`}
                    key={option.value}
                    type="button"
                    onClick={() => setPeriod(option.value)}
                    aria-pressed={activePeriod === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <label className="block w-[190px] max-[440px]:w-[150px]">
              <span className="sr-only">Search models</span>
              <input
                className="w-full rounded-full border border-hairline bg-card px-3 py-2 text-[11px] text-ink outline-none placeholder:text-muted focus:border-subtle focus:ring-4 focus:ring-wash"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                type="search"
              />
            </label>
          </div>
        )}
      </div>
      {allModels.length === 0 ? (
        <div className="grid min-h-[130px] place-items-center text-center text-xs text-muted">
          No model detail is available for this report.
        </div>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-xs text-ink">
            <thead>
              <tr>
                <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Model
                </th>
                <th className="px-3 pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Cost
                </th>
                <th className="px-3 pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Input
                </th>
                <th className="px-3 pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Output
                </th>
                <th className="px-3 pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Cache read
                </th>
                <th className="px-3 pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Total tokens
                </th>
                <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {hasGroups
                ? groups.map((group) => {
                    const models = group.models.filter((model) =>
                      modelName(model).toLowerCase().includes(search),
                    );
                    if (!models.length) return null;
                    return (
                      <ProviderGroupRows
                        key={group.agent}
                        group={group}
                        models={models}
                        expanded={expandedAgents.has(group.agent)}
                        onToggle={() => toggleAgent(group.agent)}
                        totalCost={denominator}
                      />
                    );
                  })
                : visibleModels.map((model) => (
                    <ModelRow key={modelName(model)} model={model} totalCost={denominator} />
                  ))}
              {search && visibleModels.length === 0 && (
                <tr>
                  <td className="border-t border-hairline py-6 text-center text-muted" colSpan={7}>
                    No models match “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProviderGroupRows({
  group,
  models,
  expanded,
  onToggle,
  totalCost,
}: {
  group: ProviderGroup;
  models: AggregatedModel[];
  expanded: boolean;
  onToggle: () => void;
  totalCost: number;
}) {
  const cost = models.reduce((sum, model) => sum + model.totalCost, 0);
  const tokens = models.reduce((sum, model) => sum + model.totalTokens, 0);
  return (
    <>
      <tr>
        <td colSpan={7} className="border-t border-hairline bg-panel p-0">
          <button
            className="flex w-full items-center gap-2.5 border-0 bg-transparent px-3 py-3 text-left text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            <span className="w-[15px] text-center text-lg leading-none text-muted" aria-hidden="true">
              {expanded ? "⌄" : "›"}
            </span>
            <span className="flex min-w-0 items-baseline gap-2.5">
              <strong className="text-xs font-semibold">{displayName(group.agent)}</strong>
              <small className="text-[10px] text-muted">{models.length} models</small>
            </span>
            <span className="ml-auto flex items-baseline gap-2.5 text-right">
              <strong className="text-xs font-semibold tabular-nums">{formatCurrency(cost)}</strong>
              <small className="text-[10px] text-muted">{formatTokens(tokens)} tokens</small>
            </span>
          </button>
        </td>
      </tr>
      {expanded &&
        models.map((model) => (
          <ModelRow key={`${group.agent}-${modelName(model)}`} model={model} totalCost={totalCost} />
        ))}
    </>
  );
}

function ModelRow({ model, totalCost }: { model: AggregatedModel; totalCost: number }) {
  const share = totalCost > 0 ? (model.totalCost / totalCost) * 100 : 0;
  const agent = model.agent || "All providers";
  const cell = "border-t border-hairline px-3 py-3 text-right tabular-nums";
  return (
    <tr>
      <td className="border-t border-hairline py-3 text-left">
        <div className="grid min-w-[150px] gap-1">
          <strong className="text-xs font-semibold">{displayName(modelName(model))}</strong>
          <span className="text-[10px]" style={{ color: providerColor(agent) }}>
            {displayName(agent)}
          </span>
        </div>
      </td>
      <td className={cell}>{formatCurrency(model.totalCost)}</td>
      <td className={cell}>{formatTokens(model.inputTokens)}</td>
      <td className={cell}>{formatTokens(model.outputTokens)}</td>
      <td className={cell}>{formatTokens(model.cacheReadTokens)}</td>
      <td className={cell}>{formatTokens(model.totalTokens)}</td>
      <td className="border-t border-hairline py-3 text-right tabular-nums">
        {share.toFixed(share >= 10 ? 1 : 2)}%
      </td>
    </tr>
  );
}
