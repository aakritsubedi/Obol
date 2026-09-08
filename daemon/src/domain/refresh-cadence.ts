/**
 * How far the fallback refresh may stretch while nothing is being written.
 *
 * At the default five-minute interval this tops out at half an hour, which is
 * the difference between a machine left running all day refreshing 288 times
 * and refreshing 48 — for identical numbers, since nothing wrote a transcript
 * in between.
 */
export const MAX_IDLE_MULTIPLIER = 6;

/**
 * The next multiplier for the fallback interval.
 *
 * Any filesystem activity puts it straight back to the configured interval, so
 * the first refresh after an agent starts is never late. Quiet stretches widen
 * it a step at a time rather than all at once, so a pause between turns does
 * not push the next refresh half an hour out.
 */
export function nextIdleMultiplier(current: number, sawActivity: boolean): number {
  if (sawActivity) return 1;
  const from = Number.isFinite(current) && current >= 1 ? current : 1;
  return Math.min(MAX_IDLE_MULTIPLIER, from * 2);
}
