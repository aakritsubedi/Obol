// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsageDataProvider, useUsageData } from "./UsageDataProvider";

const api = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getReport: vi.fn(),
  refresh: vi.fn(),
  rememberToken: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("@shared/api", () => api);

function CurrencyProbe() {
  const { config } = useUsageData();
  return <span data-testid="currency">{config?.currency ?? "loading"}</span>;
}

const usd = { currency: "USD", currencyRate: null };
const npr = { currency: "NPR", currencyRate: 152.75 };

describe("UsageDataProvider", () => {
  beforeEach(() => {
    api.refresh.mockResolvedValue({});
    api.getReport.mockResolvedValue({});
    api.getConfig.mockResolvedValueOnce(usd).mockResolvedValue(npr);
    api.subscribe.mockImplementation(() => vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reloads config when a daemon summary event arrives", async () => {
    let onSummary: ((summary: unknown) => void) | undefined;
    api.subscribe.mockImplementation((callback: (summary: unknown) => void) => {
      onSummary = callback;
      return vi.fn();
    });

    render(
      <UsageDataProvider>
        <CurrencyProbe />
      </UsageDataProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("currency").textContent).toBe("USD"));

    onSummary?.({ stale: false, error: null });
    await waitFor(() => expect(screen.getByTestId("currency").textContent).toBe("NPR"));
    expect(api.getConfig).toHaveBeenCalledTimes(2);
  });
});
