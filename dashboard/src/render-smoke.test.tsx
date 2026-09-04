// @vitest-environment jsdom

import ModelTable from "@features/breakdown/components/ModelTable";
import JournalCard from "@features/journal/components/JournalCard";
import TodayCard from "@features/overview/components/TodayCard";
import TotalsCard from "@features/overview/components/TotalsCard";
import BudgetSettings from "@features/settings/components/BudgetSettings";
import ShareDialog from "@features/share/components/ShareDialog";
import type { DayJournal, Report, Summary, WidgetConfig } from "@shared/api";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./app/App";

const summary: Summary = {
  today: {
    period: "2026-09-04",
    totalCost: 12.5,
    totalTokens: 12500,
    inputTokens: 5000,
    outputTokens: 4000,
    cacheCreationTokens: 1000,
    cacheReadTokens: 2500,
    modelsUsed: ["gpt-5"],
    modelBreakdowns: [{ model: "gpt-5", totalCost: 12.5, totalTokens: 12500 }],
  },
  agents: [
    {
      agent: "codex",
      totalCost: 12.5,
      totalTokens: 12500,
      inputTokens: 5000,
      outputTokens: 4000,
      cacheCreationTokens: 1000,
      cacheReadTokens: 2500,
    },
  ],
  burnRate: { costPerHour: 1.25 },
  projection: { totalCost: 25 },
  budgetStatus: "ok",
  budget: { status: "ok", dailyRatio: null, monthlyRatio: null, reason: null },
  updatedAt: "2026-09-04T08:00:00.000Z",
  stale: false,
  error: null,
};

const row = {
  period: "2026-09-04",
  agents: summary.agents,
  modelBreakdowns: summary.today.modelBreakdowns,
  modelsUsed: ["gpt-5"],
  inputTokens: 5000,
  outputTokens: 4000,
  cacheCreationTokens: 1000,
  cacheReadTokens: 2500,
  totalCost: 12.5,
  totalTokens: 12500,
  metadata: {},
};

const report: Report = {
  daily: [row],
  weekly: [row],
  monthly: [row],
  session: [],
  projects: [],
  totals: {
    inputTokens: 5000,
    outputTokens: 4000,
    cacheCreationTokens: 1000,
    cacheReadTokens: 2500,
    totalCost: 12.5,
    totalTokens: 12500,
  },
};

const config: WidgetConfig = {
  port: 4737,
  refreshIntervalMs: 300000,
  dailyBudget: null,
  monthlyBudget: null,
  warningThreshold: 0.8,
  launchAtLogin: false,
  keepAwake: false,
  keepAwakeWithLidClosed: false,
  historyDays: 90,
  journalIdleMinutes: 15,
  currency: "USD",
  currencyRate: null,
};

const journal: DayJournal = {
  date: "2026-09-04",
  timezone: "Asia/Kathmandu",
  idleMinutes: 15,
  activeMinutes: 20,
  blocks: 1,
  spanMinutes: 20,
  firstEventAt: "2026-09-04T08:00:00.000Z",
  lastEventAt: "2026-09-04T08:20:00.000Z",
  humanPrompts: 1,
  assistantTurns: 1,
  toolCalls: 1,
  toolMix: { edit: 1 },
  filesEdited: 1,
  testRuns: 1,
  providers: ["codex"],
  sessions: [],
  projects: [],
  totalCost: 12.5,
  totalTokens: 12500,
  computedAt: "2026-09-04T08:20:00.000Z",
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    const body =
      path.includes("/summary") || path.includes("/refresh")
        ? summary
        : path.includes("/report")
          ? report
          : config;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("dashboard render smoke tests", () => {
  it("renders App", () => {
    render(<App />);
    expect(screen.getByText("Token cost")).toBeTruthy();
  });

  it("renders TodayCard", () => {
    render(
      <TodayCard
        summary={summary}
        week={{ totalCost: 12.5, totalTokens: 12500, activeDays: 1, averageDaily: 12.5 }}
        trend={{ points: [], averageDaily: 0, comparison: null }}
      />,
    );
    expect(document.getElementById("today-heading")).toBeTruthy();
  });

  it("renders TotalsCard", () => {
    render(<TotalsCard report={report} summary={summary} config={config} />);
    expect(screen.getByText("History total")).toBeTruthy();
  });

  it("shows the configured currency in settings", () => {
    render(<BudgetSettings config={{ ...config, currency: "NPR" }} onSaved={() => undefined} />);
    expect(screen.getByText("Currency: NPR")).toBeTruthy();
  });

  it("renders ModelTable", () => {
    render(<ModelTable report={report} period="daily" />);
    expect(screen.getByText("Gpt 5")).toBeTruthy();
  });

  it("renders JournalCard", () => {
    render(
      <JournalCard
        journal={journal}
        options={[{ value: journal.date, label: "Today", weekday: "Fri", isToday: true }]}
        date={journal.date}
        onDateChange={() => undefined}
      />,
    );
    expect(screen.getAllByText("Tasks").length).toBeGreaterThan(0);
  });

  it("renders ShareDialog", () => {
    render(<ShareDialog report={report} summary={summary} onClose={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "Create a social card" })).toBeTruthy();
  });
});
