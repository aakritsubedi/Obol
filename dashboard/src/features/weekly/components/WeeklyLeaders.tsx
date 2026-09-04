import {
  aggregateModels,
  aggregateProjects,
  aggregateProviders,
  formatWeekRange,
  leaderRows,
  weekToDateRanges,
} from "@features/weekly/model/weekly";
import type { Report } from "@shared/api";
import SectionHeader, { HeaderBadge } from "@shared/ui/SectionHeader";
import { sectionShell } from "@shared/ui/tokens";
import { useMemo } from "react";
import LeaderPanel from "./LeaderPanel";

interface Props {
  report: Report | null;
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
    <section className={sectionShell} id="week-leaders" aria-labelledby="week-leaders-heading">
      <SectionHeader
        eyebrow="Week to date · Sun – Sat"
        id="week-leaders-heading"
        title={
          <>
            Week of {formatWeekRange(weeks.current)}
            <HeaderBadge title="Only the elapsed days of this calendar week are counted, and the comparison covers those same weekdays last week.">
              Day {weeks.dayIndex + 1} of 7
            </HeaderBadge>
          </>
        }
        description={`Ranked by cost vs ${formatWeekRange(weeks.previous)} (same days)`}
      />
      <LeaderPanel datasets={{ models, projects, providers }} />
    </section>
  );
}
