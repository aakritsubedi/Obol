import { useEffect, useMemo, useState } from "react";
import type { ProjectUsageRow } from "../api";
import { projectColor } from "../providers";
import { formatCurrency, formatTokens, projectName } from "./format";
import SectionHeader from "./SectionHeader";
import { buttonGhost, emptyState, inputControl, sectionShell, tableHead } from "./ui";

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
    <section className={sectionShell} aria-labelledby="projects-heading">
      <SectionHeader
        eyebrow="Projects"
        id="projects-heading"
        title="Claude projects"
        description={`Claude-scoped · of ${formatCurrency(total)} Claude spend · ${
          filtered.length > 5 && !showAll ? `showing top 5 of ${filtered.length}` : `${filtered.length} shown`
        }`}
        actions={
          projects.length > 0 ? (
            <label className="block w-[190px] max-[760px]:w-full">
              <span className="sr-only">Search projects</span>
              <input
                className={inputControl}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects"
                type="search"
              />
            </label>
          ) : undefined
        }
      />
      {projects.length === 0 ? (
        <div className={emptyState}>No Claude project data is available.</div>
      ) : visible.length === 0 ? (
        <div className={emptyState}>No projects match “{query}”.</div>
      ) : (
        <>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[11px] text-ink">
              <thead>
                <tr>
                  <th className={`text-left ${tableHead}`}>Project</th>
                  <th className={`px-3 text-right ${tableHead}`}>Share</th>
                  <th className={`px-3 text-right ${tableHead}`}>Tokens</th>
                  <th className={`text-right ${tableHead}`}>Cost</th>
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
                            style={{ backgroundColor: projectColor(project.key) }}
                          />
                          <span className="truncate font-medium" title={project.project}>
                            {project.project}
                          </span>
                          <span className="text-[10px] text-muted">{project.periods.size} days</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted">{share.toFixed(2)}%</td>
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
              className={`mt-4 ${buttonGhost}`}
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
