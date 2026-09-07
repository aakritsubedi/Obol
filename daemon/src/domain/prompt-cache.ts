/** How one turn's prompt divides between cached and fresh tokens. */
export interface CachedPrompt {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * Split one turn's prompt into the part the provider served from cache and the
 * part it had to read fresh.
 *
 * An agent re-sends the whole conversation on every turn, and every provider
 * behind Cursor and Copilot caches that prefix: what was already sent last turn
 * comes back as a cache read — a tenth of the input rate, or less — and only the
 * growth since is charged as input. Billing the whole prompt as input, which is
 * what both adapters used to do, overstates a long session by most of the cache
 * discount, and the error compounds with every turn because the prompt that gets
 * re-sent keeps growing.
 *
 * The first turn has nothing to read back, so its prompt is what gets written
 * into the cache. A prompt that shrank — the agent compacted its context — has
 * no growth to charge, so all of it is a read.
 *
 * Token counts are preserved exactly: the three parts always sum to `prompt`.
 * Only how they are priced changes.
 */
export function splitCachedPrompt(prompt: number, previousPrompt: number): CachedPrompt {
  const current = Math.max(0, Math.round(prompt));
  const previous = Math.max(0, Math.round(previousPrompt));
  if (previous <= 0) {
    return { inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: current };
  }
  const cacheReadTokens = Math.min(current, previous);
  return { inputTokens: current - cacheReadTokens, cacheReadTokens, cacheCreationTokens: 0 };
}
