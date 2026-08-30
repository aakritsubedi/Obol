import { useEffect, useState } from "react";
import { updateConfig, type WidgetConfig } from "../api";
import { formatCurrency, numberValue } from "./format";
import SectionHeader from "./SectionHeader";
import { buttonPrimary, sectionShell } from "./ui";

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

  // Wider than the shared `inputControl`: these are the dialog's primary
  // targets, so they get a full-size hit area and a 12px value.
  const inputClass =
    "w-full rounded-control border border-hairline bg-card px-3 py-2.5 text-xs text-ink outline-none tabular-nums transition focus:border-subtle focus:ring-4 focus:ring-wash";
  return (
    <section
      className={inDialog ? "py-5" : sectionShell}
      aria-labelledby={inDialog ? "settings-dialog-title" : "settings-heading"}
    >
      {!inDialog && (
        <SectionHeader
          eyebrow="Guardrails"
          id="settings-heading"
          title="Budget and data settings"
          actions={<span className="text-[11px] text-muted">Currency: USD</span>}
        />
      )}
      <form className="grid max-w-[720px] grid-cols-2 gap-5 max-[760px]:grid-cols-1" onSubmit={submit}>
        <label className="grid gap-2 text-[11px] font-medium text-subtle">
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
        <label className="grid gap-2 text-[11px] font-medium text-subtle">
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
        <label className="grid gap-2 text-[11px] font-medium text-subtle">
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
        <label className="col-span-full grid gap-2 text-[11px] font-medium text-subtle max-[760px]:col-span-1">
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
        <button className={`w-max ${buttonPrimary}`} type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
      {message && <div className="mt-5 text-[11px] text-ok-strong">{message}</div>}
    </section>
  );
}
