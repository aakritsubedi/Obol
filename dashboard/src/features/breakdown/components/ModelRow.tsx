import { modelName } from "@shared/analytics/totals";
import { displayName, formatCurrency, formatTokens } from "@shared/lib/format";
import { providerColor, providerName } from "@shared/providers/catalog";
import type { AggregatedModel } from "../model/totals";

export default function ModelRow({ model, totalCost }: { model: AggregatedModel; totalCost: number }) {
  const share = totalCost > 0 ? (model.totalCost / totalCost) * 100 : 0;
  const agent = model.agent || "All providers";
  const cell = "border-t border-hairline px-3 py-3 text-right tabular-nums";
  return (
    <tr>
      <td className="border-t border-hairline py-3 text-left">
        <div className="grid min-w-[150px] gap-1">
          <strong className="text-[11px] font-semibold">{displayName(modelName(model))}</strong>
          <span className="text-[10px]" style={{ color: providerColor(agent) }}>
            {providerName(agent)}
          </span>
        </div>
      </td>
      <td className={cell}>{formatCurrency(model.totalCost)}</td>
      <td className={cell}>{formatTokens(model.inputTokens)}</td>
      <td className={cell}>{formatTokens(model.outputTokens)}</td>
      <td className={cell}>{formatTokens(model.cacheReadTokens)}</td>
      <td className={cell}>{formatTokens(model.totalTokens)}</td>
      <td className="border-t border-hairline py-3 pr-3 text-right tabular-nums">
        <div className="ml-auto flex w-[74px] items-center justify-end gap-1.5">
          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-track">
            <span
              className="block h-full rounded-full bg-subtle"
              style={{ width: `${Math.min(100, share)}%` }}
            />
          </span>
          <span className="w-8 text-right text-[10px]">{share.toFixed(share >= 10 ? 1 : 2)}%</span>
        </div>
      </td>
    </tr>
  );
}
