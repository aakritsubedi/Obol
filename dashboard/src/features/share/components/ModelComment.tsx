import { formatCurrency, formatTokens } from "@shared/lib/format";
import { providerColor, providerName } from "@shared/providers/catalog";
import { ProviderLogo } from "@shared/providers/ProviderLogo";
import type { ShareModel } from "../model/shareData";

export default function ModelComment({ model }: { model: ShareModel }) {
  const color = providerColor(model.provider);
  return (
    <span
      className="inline-flex min-w-0 items-start gap-2 text-[10px]"
      title={`${model.model} · ${providerName(model.provider)} · ${formatCurrency(model.cost)} · ${formatTokens(model.tokens)} tokens`}
    >
      <span className="shrink-0">
        <ProviderLogo agent={model.provider} size={20} color={color} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#e7e9ed]">
          {model.model.split("/")[1] ? model.model.split("/")[1] : model.model}
        </span>
        <span className="mt-0.5 block truncate tabular-nums text-[#aeb4bf]">
          {formatCurrency(model.cost)} · {formatTokens(model.tokens)} tokens
        </span>
      </span>
    </span>
  );
}
