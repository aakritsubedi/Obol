export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

/** The CSS ramp used by the dashboard's day and contribution views. */
export const contributionRamp: Record<ContributionLevel, string> = {
  0: "var(--contribution-level-0)",
  1: "var(--contribution-level-1)",
  2: "var(--contribution-level-2)",
  3: "var(--contribution-level-3)",
  4: "var(--contribution-level-4)",
};

/** The same semantic ramp resolved for the always-dark share image canvas. */
export const contributionExportRamp: Record<ContributionLevel, string> = {
  0: "#24272d",
  1: "#2f3847",
  2: "#475468",
  3: "#67758f",
  4: "#94a2bb",
};
