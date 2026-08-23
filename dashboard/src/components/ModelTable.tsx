import { useEffect, useMemo, useState } from "react";
import type { Report } from "../api";
import { ProviderLogo, providerColor, providerName } from "../providers";
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
  period: ReportPeriod;
}

const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

type SortKey = "name" | "totalCost" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "totalTokens";
type SortDirection = "asc" | "desc";

function sortModels(models: AggregatedModel[], key: SortKey, direction: SortDirection): AggregatedModel[] {
  return [...models].sort((left, right) => {
    const compared =
      key === "name"
        ? modelName(left).localeCompare(modelName(right))
        : Number(left[key]) - Number(right[key]);
    return (direction === "asc" ? compared : -compared) || modelName(left).localeCompare(modelName(right));
  });
}

function SortButton({
  label,
  sortKey,
  active,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted hover:text-ink"
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

export default function ModelTable({ report, period }: Props) {
  const [query, setQuery] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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
  const visibleModels = sortModels(
    allModels.filter((model) => modelName(model).toLowerCase().includes(search)),
    sortKey,
    sortDirection,
  );
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

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) setSortDirection((value) => (value === "desc" ? "asc" : "desc"));
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "name" ? "asc" : "desc");
    }
  }

  return (
    <section className="border-t border-hairline py-8" id="models" aria-labelledby="models-heading">
      <div className="mb-5 flex items-start justify-between gap-4 max-[760px]:flex-wrap">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="models-heading"
          >
            Usage by provider & model
          </div>
          <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">
            {visibleModels.length} of {allModels.length} {visibleModels.length === 1 ? "model" : "models"}{" "}
            <span className="text-[11px] font-medium tracking-normal text-muted">{periodLabel}</span>
          </h2>
        </div>
        {allModels.length > 0 && (
          <div className="flex items-center gap-2.5 max-[760px]:w-full max-[760px]:justify-between">
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
                <th className="pb-3 text-left">
                  <SortButton
                    label="Model"
                    sortKey="name"
                    active={sortKey === "name"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className="px-3 pb-3 text-right">
                  <SortButton
                    label="Cost"
                    sortKey="totalCost"
                    active={sortKey === "totalCost"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className="px-3 pb-3 text-right">
                  <SortButton
                    label="Input"
                    sortKey="inputTokens"
                    active={sortKey === "inputTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className="px-3 pb-3 text-right">
                  <SortButton
                    label="Output"
                    sortKey="outputTokens"
                    active={sortKey === "outputTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className="px-3 pb-3 text-right">
                  <SortButton
                    label="Cache read"
                    sortKey="cacheReadTokens"
                    active={sortKey === "cacheReadTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className="px-3 pb-3 text-right">
                  <SortButton
                    label="Total tokens"
                    sortKey="totalTokens"
                    active={sortKey === "totalTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
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
                        models={sortModels(models, sortKey, sortDirection)}
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
  const inputTokens = models.reduce((sum, model) => sum + model.inputTokens, 0);
  const outputTokens = models.reduce((sum, model) => sum + model.outputTokens, 0);
  const cacheReadTokens = models.reduce((sum, model) => sum + model.cacheReadTokens, 0);
  const share = totalCost > 0 ? (cost / totalCost) * 100 : 0;
  const cell = "border-t border-hairline px-3 py-3 text-right tabular-nums";
  return (
    <>
      <tr>
        <td className="border-t border-hairline bg-panel py-3 text-left">
          <button
            className="flex w-full items-center gap-2.5 border-0 bg-transparent px-3 text-left text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            <span className="w-[15px] text-center text-lg leading-none text-muted" aria-hidden="true">
              {expanded ? "⌄" : "›"}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <ProviderLogo agent={group.agent} size={16} />
              <strong className="text-xs font-semibold">{providerName(group.agent)}</strong>
            </span>
            <small className="text-[10px] text-muted">
              {models.length} {models.length === 1 ? "model" : "models"}
            </small>
          </button>
        </td>
        <td className={`${cell} bg-panel`}>{formatCurrency(cost)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(inputTokens)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(outputTokens)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(cacheReadTokens)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(tokens)}</td>
        <td className="border-t border-hairline bg-panel py-3 pr-3 text-right tabular-nums">
          <div className="ml-auto flex w-[74px] items-center justify-end gap-1.5">
            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-track">
              <span
                className="block h-full rounded-full bg-subtle"
                style={{ width: `${Math.min(100, share)}%` }}
              />
            </span>
            <span className="w-8 text-right text-[10px]">{share.toFixed(share >= 10 ? 1 : 2)}%</span>
          </div>
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
            {providerName(agent)}
          </span>
        </div>
      </td>
      <td className={cell}>{formatCurrency(model.totalCost)}</td>
      <td className={cell}>{formatTokens(model.inputTokens)}</td>
      <td className={cell}>{formatTokens(model.outputTokens)}</td>
      <td className={cell}>{formatTokens(model.cacheReadTokens)}</td>
      <td className={cell}>{formatTokens(model.totalTokens)}</td>
      <td className="border-t border-hairline py-3 pr-3 text-right tabular-nums">
        <div className="ml-auto flex w-[74px] items-center justify-end gap-1.5">
          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-track">
            <span
              className="block h-full rounded-full bg-subtle"
              style={{ width: `${Math.min(100, share)}%` }}
            />
          </span>
          <span className="w-8 text-right text-[10px]">{share.toFixed(share >= 10 ? 1 : 2)}%</span>
        </div>
      </td>
    </tr>
  );
}
