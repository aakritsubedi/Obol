import {
  aggregateByProvider,
  aggregateModels,
  modelRowsFor,
  periodHasModelData,
  type ReportPeriod,
} from "@features/breakdown/model/totals";
import { modelName } from "@shared/analytics/totals";
import type { Report } from "@shared/api";
import SectionHeader from "@shared/ui/SectionHeader";
import { emptyState, inputControl, sectionShell, tableHead } from "@shared/ui/tokens";
import { useEffect, useMemo, useState } from "react";
import { type SortDirection, type SortKey, sortModels } from "../model/sort";
import ModelRow from "./ModelRow";
import ProviderGroupRows from "./ProviderGroupRows";
import SortButton from "./SortButton";

interface Props {
  report: Report | null;
  period: ReportPeriod;
}

const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

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
  useEffect(() => {
    void activePeriod;
    setExpandedAgents(new Set());
  }, [activePeriod]);
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
    <section className={sectionShell} id="models" aria-labelledby="models-heading">
      <SectionHeader
        eyebrow="Usage by provider & model"
        id="models-heading"
        title={
          <>
            {visibleModels.length} of {allModels.length} {visibleModels.length === 1 ? "model" : "models"}
            <span className="text-[11px] font-normal tracking-normal text-muted">{periodLabel}</span>
          </>
        }
        actions={
          allModels.length > 0 ? (
            <label className="block w-[190px] max-[440px]:w-[150px]">
              <span className="sr-only">Search models</span>
              <input
                className={inputControl}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                type="search"
              />
            </label>
          ) : undefined
        }
      />
      {allModels.length === 0 ? (
        <div className={emptyState}>No model detail is available for this report.</div>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[11px] text-ink">
            <thead>
              <tr>
                <th className={`text-left ${tableHead}`}>
                  <SortButton
                    label="Model"
                    sortKey="name"
                    active={sortKey === "name"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className={`px-3 text-right ${tableHead}`}>
                  <SortButton
                    label="Cost"
                    sortKey="totalCost"
                    active={sortKey === "totalCost"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className={`px-3 text-right ${tableHead}`}>
                  <SortButton
                    label="Input"
                    sortKey="inputTokens"
                    active={sortKey === "inputTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className={`px-3 text-right ${tableHead}`}>
                  <SortButton
                    label="Output"
                    sortKey="outputTokens"
                    active={sortKey === "outputTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className={`px-3 text-right ${tableHead}`}>
                  <SortButton
                    label="Cache read"
                    sortKey="cacheReadTokens"
                    active={sortKey === "cacheReadTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className={`px-3 text-right ${tableHead}`}>
                  <SortButton
                    label="Total tokens"
                    sortKey="totalTokens"
                    active={sortKey === "totalTokens"}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                </th>
                <th className={`text-right ${tableHead}`}>Share</th>
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
                  <td
                    className="border-t border-hairline py-8 text-center text-[11px] text-muted"
                    colSpan={7}
                  >
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
