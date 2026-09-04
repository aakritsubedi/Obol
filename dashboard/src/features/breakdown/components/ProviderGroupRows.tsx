import { modelName } from "@shared/analytics/totals";
import { formatCurrency, formatTokens } from "@shared/lib/format";
import { providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import { CHEVRON_DOWN, CHEVRON_RIGHT, Icon } from "@shared/ui/icons";
import type { AggregatedModel, ProviderGroup } from "../model/totals";
import ModelRow from "./ModelRow";

export default function ProviderGroupRows({
  group,
  models,
  expanded,
  onToggle,
  totalCost,
}: {
  group: ProviderGroup;
  models: AggregatedModel[];
  expanded: boolean;
  onToggle: () => void;
  totalCost: number;
}) {
  const cost = models.reduce((sum, model) => sum + model.totalCost, 0);
  const tokens = models.reduce((sum, model) => sum + model.totalTokens, 0);
  const inputTokens = models.reduce((sum, model) => sum + model.inputTokens, 0);
  const outputTokens = models.reduce((sum, model) => sum + model.outputTokens, 0);
  const cacheReadTokens = models.reduce((sum, model) => sum + model.cacheReadTokens, 0);
  const share = totalCost > 0 ? (cost / totalCost) * 100 : 0;
  const cell = "border-t border-hairline px-3 py-3 text-right tabular-nums";
  return (
    <>
      <tr>
        <td className="border-t border-hairline bg-panel py-3 text-left">
          <button
            className="flex w-full items-center gap-2.5 border-0 bg-transparent px-3 text-left text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            <Icon path={expanded ? CHEVRON_DOWN : CHEVRON_RIGHT} className="h-3 w-3 shrink-0 text-muted" />
            <span className="flex min-w-0 items-center gap-2">
              <ProviderLogo agent={group.agent} size={16} />
              <strong className="text-[11px] font-semibold">{providerName(group.agent)}</strong>
            </span>
            <small className="text-[10px] text-muted">
              {models.length} {models.length === 1 ? "model" : "models"}
            </small>
          </button>
        </td>
        <td className={`${cell} bg-panel`}>{formatCurrency(cost)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(inputTokens)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(outputTokens)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(cacheReadTokens)}</td>
        <td className={`${cell} bg-panel`}>{formatTokens(tokens)}</td>
        <td className="border-t border-hairline bg-panel py-3 pr-3 text-right tabular-nums">
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
      {expanded &&
        models.map((model) => (
          <ModelRow key={`${group.agent}-${modelName(model)}`} model={model} totalCost={totalCost} />
        ))}
    </>
  );
}
