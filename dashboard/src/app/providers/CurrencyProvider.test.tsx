// @vitest-environment jsdom

import { formatCurrency, setMoneyDisplay } from "@shared/lib/format";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrencyProvider, useCurrency } from "./CurrencyProvider";

const usage = vi.hoisted(() => ({
  config: { currency: "NPR", currencyRate: 152.75 },
}));

vi.mock("./UsageDataProvider", () => ({
  useUsageData: () => usage,
}));

function CurrencyProbe() {
  const display = useCurrency();
  return <span data-testid="amount">{`${display.code}: ${formatCurrency(10, "en-US")}`}</span>;
}

describe("CurrencyProvider", () => {
  afterEach(() => {
    cleanup();
    setMoneyDisplay({ code: "USD", rate: 1 });
  });

  it("applies the daemon's shared currency rate to dashboard formatting", async () => {
    render(
      <CurrencyProvider>
        <CurrencyProbe />
      </CurrencyProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("amount").textContent).toBe("NPR: NPR\u00a01,527.50");
    });
  });
});
