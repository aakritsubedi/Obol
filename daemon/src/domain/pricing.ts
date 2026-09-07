import { numberValue } from "../shared/coerce.js";

/** USD per million tokens, by token kind. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface PricingEntry {
  id: string;
  aliases: string[];
  price: ModelPrice;
}

export interface PricingTable {
  entries: PricingEntry[];
  source?: string;
  fetchedAt?: string;
  sourceUpdatedAt?: string | null;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// Published list prices, USD per million tokens. Output runs several times
// input and a cache read a fraction of it, so a single blended rate would
// misprice any agent whose traffic is lopsided — and editor agents send far
// more context than they generate. Copilot and Cursor are flat-fee
// subscriptions, so these figures are a comparison estimate, not an invoice.
// Unknown models stay unpriced rather than being guessed at.
const PRICES: Record<string, ModelPrice> = {
  // Anthropic first-party rates. Cache writes bill at 1.25x input and reads at
  // 0.1x, except Fable 5.1, which reads cache at a flat $0.25.
  claudefable51: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  claudefable5: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  claudemythos51: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  claudemythos5: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  claudeopus5: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  claudeopus48: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  claudeopus47: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  claudeopus46: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  claudeopus45: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  claudesonnet5: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  claudesonnet46: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  claudesonnet45: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  claudehaiku45: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  // OpenAI and Google list prices, for the models Copilot and Cursor route to.
  gpt5mini: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0.25 },
  gpt5nano: { input: 0.05, output: 0.4, cacheRead: 0.005, cacheWrite: 0.05 },
  gpt5: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
  gpt41mini: { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 },
  gpt41: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
  gpt4omini: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.15 },
  gpt4o: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },
  o4mini: { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 1.1 },
  o3mini: { input: 1.1, output: 4.4, cacheRead: 0.55, cacheWrite: 1.1 },
  o3: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
  geminiflash: { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0.3 },
  geminipro: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 1.25 },
  // Cursor Composer 2.5 list prices. Fast is the product default and may appear as
  // composer-2.5-fast in usage; standard is composer-2.5 with Fast toggled off.
  composer25fast: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  composer25: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
  composer: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
};

/** The offline safety net used before the first pricing download or offline. */
export const BUNDLED_PRICING: PricingTable = {
  source: "bundled",
  entries: Object.entries(PRICES).map(([id, price]) => ({ id, aliases: [id], price })),
};

/** Prefer the downloaded table, but keep provider-specific offline aliases. */
export function mergePricingTables(
  primary: PricingTable,
  fallback: PricingTable = BUNDLED_PRICING,
): PricingTable {
  return {
    ...primary,
    entries: [...primary.entries, ...fallback.entries],
  };
}

function normalizeModel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
}

function matchScore(model: string, alias: string): number {
  const normalizedModel = normalizeModel(model);
  const normalizedAlias = normalizeModel(alias);
  if (!normalizedModel || !normalizedAlias) return 0;
  if (normalizedModel === normalizedAlias) return 1_000_000 + normalizedAlias.length;
  if (normalizedModel.includes(normalizedAlias)) return 100_000 + normalizedAlias.length;

  // Providers do not agree on whether the family comes before or after its
  // version, e.g. `claude-4.5-sonnet` vs `claude-sonnet-4.5`. Treat the
  // separator-delimited token set as a weaker match than an exact substring.
  const modelTokens = tokens(model);
  const aliasTokens = tokens(alias);
  if (
    aliasTokens.length >= 2 &&
    aliasTokens.every((token) => modelTokens.includes(token)) &&
    modelTokens.length <= aliasTokens.length + 2
  ) {
    return 50_000 + normalizedAlias.length;
  }
  return 0;
}

/** The bundled price for a model, or null when it is not one we know. */
export function priceFor(model: string, table: PricingTable = BUNDLED_PRICING): ModelPrice | null {
  let best: { price: ModelPrice; score: number } | null = null;
  for (const entry of table.entries) {
    for (const alias of entry.aliases) {
      const score = matchScore(model, alias);
      if (score > (best?.score ?? 0)) best = { price: entry.price, score };
    }
  }
  return best?.price ?? null;
}

/** Estimate USD cost for a day's tokens, pricing each kind at its own rate. */
export function estimateCost(
  model: string,
  tokens: TokenCounts,
  table: PricingTable = BUNDLED_PRICING,
): number {
  const price = priceFor(model, table);
  if (!price) return 0;
  const per = (count: unknown, rate: number): number => (Math.max(0, numberValue(count)) / 1_000_000) * rate;
  return (
    per(tokens.inputTokens, price.input) +
    per(tokens.outputTokens, price.output) +
    per(tokens.cacheReadTokens, price.cacheRead) +
    per(tokens.cacheCreationTokens, price.cacheWrite)
  );
}
