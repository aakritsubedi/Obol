export interface BudgetConfig {
  dailyBudget: number | null;
  monthlyBudget: number | null;
  warningThreshold: number;
}

export interface WidgetConfig extends BudgetConfig {
  port: number;
  refreshIntervalMs: number;
  launchAtLogin: boolean;
  keepAwake: boolean;
  keepAwakeWithLidClosed: boolean;
  historyDays: number;
  journalIdleMinutes: number;
  currency: string;
  /** Latest USD-to-currency rate shared by the native app and dashboard. */
  currencyRate: number | null;
}
