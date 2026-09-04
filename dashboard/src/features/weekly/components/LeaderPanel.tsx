import { type LeaderRow, normalizeModelName } from "@features/weekly/model/weekly";
import { displayName, formatCurrency, formatTokens } from "@shared/lib/format";
import { projectColor, providerColor, providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import Segmented from "@shared/ui/Segmented";
import { cardSurface, emptyState, tableHead } from "@shared/ui/tokens";
import { useState } from "react";
import Delta from "./Delta";

const TOP_COUNT = 3;

// Names render in narrow cards, so cap them by character count instead of
// clipping mid-word with CSS; the full label stays on the title tooltip.
const NAME_LIMIT = 26;

function limitName(value: string): string {
  if (value.length <= NAME_LIMIT) return value;
  return `${value.slice(0, NAME_LIMIT - 1).trimEnd()}…`;
}

type LeaderKind = "models" | "projects" | "providers";

export default function LeaderPanel({ datasets }: { datasets: Record<LeaderKind, LeaderRow[]> }) {
  const [selected, setSelected] = useState<LeaderKind>("models");
  const rows = datasets[selected];
  const showLogo = selected === "providers";
  const isProject = selected === "projects";
  const dotColor = (row: LeaderRow) => (isProject ? projectColor(row.name) : providerColor(row.name));
  const rawName = (row: LeaderRow) => row.name || "Unknown";
  const displayLabel = (row: LeaderRow) => {
    if (selected === "models") return normalizeModelName(rawName(row));
    if (showLogo) return providerName(rawName(row));
    return displayName(rawName(row), "Unknown");
  };
  const renderName = (row: LeaderRow) => limitName(displayLabel(row));
  // Only the podium gets table rows; the long tail becomes compact pills so a
  // busy week cannot stretch the card or squeeze the columns.
  const top = rows.slice(0, TOP_COUNT);
  const rest = rows.slice(TOP_COUNT);
  return (
    <div className={`min-h-[290px] min-w-0 p-5 ${cardSurface}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Week ranking dimension"
          value={selected}
          onChange={setSelected}
          options={[
            { value: "models", label: "Models" },
            { value: "projects", label: "Projects" },
            { value: "providers", label: "Providers" },
          ]}
        />
        <span className="whitespace-nowrap text-[10px] text-muted">
          {rows.length} {rows.length === 1 ? "entry" : "entries"} this week
        </span>
      </div>
      {rows.length === 0 ? (
        <p className={emptyState}>No usage in this period.</p>
      ) : (
        <>
          <table className="mt-5 w-full table-fixed border-collapse text-[11px]">
            <thead>
              <tr>
                <th className={`w-[46%] text-left ${tableHead}`}>Name</th>
                <th className={`px-2 text-right ${tableHead}`}>Cost</th>
                <th className={`text-right ${tableHead}`}>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr className="border-t border-hairline" key={row.name}>
                  <td className="py-2.5 pr-1">
                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                      {showLogo ? (
                        <ProviderLogo agent={row.name} size={14} />
                      ) : (
                        <i
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColor(row) }}
                        />
                      )}
                      <span
                        className="truncate font-medium"
                        title={displayLabel(row) !== rawName(row) ? rawName(row) : displayLabel(row)}
                      >
                        {renderName(row)}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <span className="block whitespace-nowrap tabular-nums">{formatCurrency(row.cost)}</span>
                    <Delta ratio={row.costRatio} baseline={row.costBaseline} format={formatCurrency} />
                  </td>
                  <td
                    className="py-2.5 text-right"
                    title={`${formatTokens(row.inputTokens)} input · ${formatTokens(row.outputTokens)} output · ${formatTokens(row.cacheReadTokens)} cache read`}
                  >
                    <span className="block whitespace-nowrap tabular-nums">{formatTokens(row.tokens)}</span>
                    {row.costRatio !== null && (
                      <Delta ratio={row.tokenRatio} baseline={row.tokenBaseline} format={formatTokens} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rest.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-hairline pt-4">
              {rest.map((row) => (
                <span
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-panel px-2 py-1 text-[10px]"
                  key={row.name}
                  title={`${displayLabel(row) !== rawName(row) ? `${rawName(row)} · ` : ""}${formatCurrency(row.cost)} · ${formatTokens(row.tokens)} tokens (${formatTokens(row.cacheReadTokens)} cache read)`}
                >
                  {showLogo ? (
                    <ProviderLogo agent={row.name} size={12} />
                  ) : (
                    <i
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor(row) }}
                    />
                  )}
                  <span className="truncate font-medium">{renderName(row)}</span>
                  <span className="whitespace-nowrap tabular-nums text-muted">
                    {formatCurrency(row.cost)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
