import type { ReactNode } from "react";
import { CurrencyProvider } from "./CurrencyProvider";
import { ThemeProvider } from "./ThemeProvider";
import { UsageDataProvider } from "./UsageDataProvider";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <UsageDataProvider>
        <CurrencyProvider>{children}</CurrencyProvider>
      </UsageDataProvider>
    </ThemeProvider>
  );
}
