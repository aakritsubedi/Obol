import { useEffect, useState } from "react";
import { updateConfig, type WidgetConfig } from "../api";
import { formatCurrency, numberValue } from "./format";

interface Props {
  config: WidgetConfig;
  onSaved: (config: WidgetConfig) => void;
  inDialog?: boolean;
}

export default function BudgetSettings({ config, onSaved, inDialog = false }: Props) {
  const [daily, setDaily] = useState(config.dailyBudget === null ? "" : String(config.dailyBudget));
  const [monthly, setMonthly] = useState(config.monthlyBudget === null ? "" : String(config.monthlyBudget));
  const [threshold, setThreshold] = useState(String(Math.round(config.warningThreshold * 100)));
  const [historyDays, setHistoryDays] = useState(String(config.historyDays));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDaily(config.dailyBudget === null ? "" : String(config.dailyBudget));
    setMonthly(config.monthlyBudget === null ? "" : String(config.monthlyBudget));
    setThreshold(String(Math.round(config.warningThreshold * 100)));
    setHistoryDays(String(config.historyDays));
  }, [config]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const saved = await updateConfig({
        dailyBudget: daily.trim() ? Math.max(0, numberValue(daily)) : null,
        monthlyBudget: monthly.trim() ? Math.max(0, numberValue(monthly)) : null,
        warningThreshold: Math.min(1, Math.max(0.01, numberValue(threshold) / 100)),
        historyDays: Math.min(365, Math.max(7, Math.round(numberValue(historyDays)))),
      });
      onSaved(saved);
      setMessage("Settings saved; the daemon is refreshing the affected data.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-[10px] border border-hairline bg-card px-3 py-2.5 text-ink outline-none tabular-nums focus:border-ink focus:ring-4 focus:ring-wash";
  return (
    <section
      className={inDialog ? "py-5" : "border-t border-hairline py-8"}
      aria-labelledby={inDialog ? "settings-dialog-title" : "settings-heading"}
    >
      {!inDialog && (
        <div className="mb-[22px] flex items-start justify-between gap-[18px]">
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.13em] leading-tight text-muted"
              id="settings-heading"
            >
              Guardrails
            </div>
            <h2 className="mt-1.5 text-[17px] font-bold tracking-[-0.025em]">Budget and data settings</h2>
          </div>
          <span className="text-[11px] text-muted">Currency: USD</span>
        </div>
      )}
      <form className="grid max-w-[760px] grid-cols-2 gap-[22px] max-[760px]:grid-cols-1" onSubmit={submit}>
        <label className="grid gap-2 text-xs text-subtle">
          Daily cap
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            placeholder="No cap"
            value={daily}
            onChange={(event) => setDaily(event.target.value)}
          />
          <small className="text-[10px] text-muted">{daily ? formatCurrency(daily) : "Disabled"}</small>
        </label>
        <label className="grid gap-2 text-xs text-subtle">
          Monthly cap
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            placeholder="No cap"
            value={monthly}
            onChange={(event) => setMonthly(event.target.value)}
          />
          <small className="text-[10px] text-muted">{monthly ? formatCurrency(monthly) : "Disabled"}</small>
        </label>
        <label className="grid gap-2 text-xs text-subtle">
          History window
          <select
            className={inputClass}
            value={historyDays}
            onChange={(event) => setHistoryDays(event.target.value)}
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">365 days</option>
          </select>
          <small className="text-[10px] text-muted">Bounds the daemon’s log parsing on refresh.</small>
        </label>
        <label className="col-span-full grid gap-2 text-xs text-subtle max-[760px]:col-span-1">
          Warn at <span className="font-semibold text-ink">{threshold}%</span>
          <input
            className="w-full accent-ink"
            type="range"
            min="50"
            max="99"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
          <small className="text-[10px] text-muted">
            Used to tint budget status in the dashboard and menu bar.
          </small>
        </label>
        <button
          className="w-max rounded-full border-0 bg-ink px-3.5 py-2 text-xs font-semibold text-surface transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-50"
          type="submit"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
      {message && <div className="mt-[18px] text-[11px] text-ok-strong">{message}</div>}
    </section>
  );
}
