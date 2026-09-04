import { formatCurrency, formatTokens } from "@shared/lib/format";
import { providerColor, providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import type { ShareModel } from "../model/shareData";

export default function ModelRow({ model }: { model: ShareModel }) {
  const color = providerColor(model.provider);
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0">
        <ProviderLogo agent={model.provider} size={26} color={color} />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
          title={`${model.model} · ${formatCurrency(model.cost)} · ${formatTokens(model.tokens)}`}
        >
          <span className="min-w-0 flex-1 truncate font-semibold">
            {model.model.split("/")[1] ? model.model.split("/")[1] : model.model}
          </span>
          <span className="shrink-0 whitespace-nowrap tabular-nums text-[#aeb4bf]">
            {formatCurrency(model.cost)} · {formatTokens(model.tokens)}
          </span>
        </div>
        <p className="mt-0.5 text-[9px] text-[#737987]">{providerName(model.provider).toLowerCase()}</p>
      </div>
    </div>
  );
}
