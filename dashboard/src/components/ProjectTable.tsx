import { useEffect, useMemo, useState } from "react";
import type { ProjectUsageRow } from "../api";
import { providerColor } from "../providers";
import { formatCurrency, formatTokens, projectName } from "./format";

interface Props {
  projects: ProjectUsageRow[];
}

interface ProjectSummary {
  project: string;
  key: string;
  totalCost: number;
  totalTokens: number;
  periods: Set<string>;
}

export default function ProjectTable({ projects }: Props) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const summaries = useMemo(() => {
    const grouped = new Map<string, ProjectSummary>();
    for (const row of projects) {
      const label = projectName(row.project);
      const key = label.toLowerCase();
      const current = grouped.get(key) || {
        project: label,
        key,
        totalCost: 0,
        totalTokens: 0,
        periods: new Set<string>(),
      };
      current.totalCost += row.totalCost;
      current.totalTokens += row.totalTokens;
      current.periods.add(row.period);
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((left, right) => right.totalCost - left.totalCost);
  }, [projects]);
  const filtered = summaries.filter((project) =>
    project.project.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const visible = filtered.slice(0, showAll ? filtered.length : 5);
  const total = summaries.reduce((sum, project) => sum + project.totalCost, 0);

  useEffect(() => {
    setShowAll(false);
  }, [projects, query]);

  return (
    <section className="border-t border-hairline py-8" aria-labelledby="projects-heading">
      <div className="mb-5 flex items-start justify-between gap-4 max-[760px]:flex-wrap">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
            id="projects-heading"
          >
            Projects
          </div>
          <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">Claude projects</h2>
          <p className="mt-1 text-[11px] text-muted">
            Project grouping is Claude-scoped on ccusage ·{" "}
            {filtered.length > 5 && !showAll
              ? `showing top 5 of ${filtered.length}`
              : `${filtered.length} shown`}
          </p>
        </div>
        {projects.length > 0 && (
          <label className="block w-[190px] max-[760px]:w-full">
            <span className="sr-only">Search projects</span>
            <input
              className="w-full rounded-full border border-hairline bg-card px-3 py-2 text-[11px] text-ink outline-none placeholder:text-muted focus:border-subtle focus:ring-4 focus:ring-wash"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              type="search"
            />
          </label>
        )}
      </div>
      {projects.length === 0 ? (
        <div className="grid min-h-[130px] place-items-center text-center text-xs text-muted">
          No Claude project data is available.
        </div>
      ) : visible.length === 0 ? (
        <div className="grid min-h-[110px] place-items-center text-center text-xs text-muted">
          No projects match “{query}”.
        </div>
      ) : (
        <>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-xs text-ink">
              <thead>
                <tr>
                  <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                    Project
                  </th>
                  <th className="px-3 pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                    Share
                  </th>
                  <th className="px-3 pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                    Tokens
                  </th>
                  <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((project) => {
                  const share = total > 0 ? (project.totalCost / total) * 100 : 0;
                  return (
                    <tr className="border-t border-hairline" key={project.key}>
                      <td className="py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <i
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: providerColor(project.key) }}
                          />
                          <span className="truncate font-medium" title={project.project}>
                            {project.project}
                          </span>
                          <span className="text-[10px] text-muted">{project.periods.size} days</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted">{share.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted">
                        {formatTokens(project.totalTokens)}
                      </td>
                      <td className="py-3 text-right font-semibold tabular-nums">
                        {formatCurrency(project.totalCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 5 && (
            <button
              className="mt-4 rounded-full border border-hairline bg-transparent px-3 py-2 text-[11px] font-semibold text-ink transition hover:bg-wash"
              type="button"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show top 5" : `Show all ${filtered.length} projects`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
