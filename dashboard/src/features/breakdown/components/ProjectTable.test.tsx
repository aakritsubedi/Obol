// @vitest-environment jsdom

import type { ProjectUsageRow } from "@shared/api";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ProjectTable from "./ProjectTable";

afterEach(cleanup);

function projectRow(slug: string, cost: number, period = "2026-09-04"): ProjectUsageRow {
  return {
    project: slug,
    period,
    agents: [],
    modelBreakdowns: [],
    modelsUsed: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: cost,
    totalTokens: 0,
    metadata: {},
  };
}

describe("ProjectTable", () => {
  it("keeps separate rows for different slugs that share a display name", () => {
    render(
      <ProjectTable
        projects={[
          projectRow("-Users-dev-work-api", 10),
          projectRow("-Users-dev-personal-api", 20),
        ]}
      />,
    );

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(screen.getByText("$10.00")).toBeTruthy();
    expect(screen.getByText("$20.00")).toBeTruthy();
  });

  it("links to the transcript cwd instead of reversing the slug", () => {
    render(
      <ProjectTable
        projects={[projectRow("-Users-dev-dolpo.ai", 5)]}
        projectPaths={{ "-Users-dev-dolpo.ai": "/Users/dev/dolpo.ai" }}
      />,
    );

    const link = screen.getByRole("link", { name: /Open Dolpo\.Ai in VS Code/i });
    expect(link.getAttribute("href")).toBe("vscode://file/Users/dev/dolpo.ai");
  });
});
