import { numberValue } from "../shared/coerce.js";

// These are representative blended USD rates per million tokens. Copilot and
// Cursor are flat-fee subscriptions, so this is a useful comparison estimate,
// not an invoice. Unknown models deliberately remain unpriced.
const USD_PER_MILLION: Record<string, number> = {
  claudeopus45: 15,
  claudeopus4: 15,
  claudesonnet45: 7.5,
  claudesonnet4: 7.5,
  claudehaiku45: 1.5,
  claudehaiku4: 1.5,
  gpt5mini: 1.125,
  gpt5: 5,
  gpt4o: 3.75,
  gpt4: 15,
  o3mini: 2.25,
  o3: 8,
  composer25: 1.5,
  composer: 1.5,
};

const priceKeys = Object.keys(USD_PER_MILLION).sort((left, right) => right.length - left.length);

function normalizeModel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pricePerMillion(model: string): number {
  const normalized = normalizeModel(model);
  const key = priceKeys.find((candidate) => normalized.includes(candidate));
  return key ? USD_PER_MILLION[key] : 0;
}

/** Estimate USD cost for a token count using the bundled model table. */
export function estimateCost(model: string, tokens: number): number {
  const count = numberValue(tokens);
  const price = pricePerMillion(model);
  return count > 0 && price > 0 ? (count / 1_000_000) * price : 0;
}
