/**
 * Robust statistics helpers.
 *
 * Percentile and MAD rather than mean and standard deviation throughout: range
 * readings are contaminated by spurious *short* returns (a reflection off a
 * litter box rim, an insect crossing the beam), which are one-sided outliers.
 * Mean and SD are dragged by exactly those.
 */

/** Ascending copy. Never mutates the input. */
export function sortedAsc(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Linearly interpolated percentile. `p` is a fraction in [0, 1].
 * Throws on an empty input rather than returning NaN, because a silent NaN
 * here becomes a silently blind detector.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new RangeError("percentile() needs at least one value");
  if (!(p >= 0 && p <= 1)) throw new RangeError(`percentile() p must be in [0, 1], got ${p}`);

  const s = sortedAsc(values);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = s[lo]!;
  if (lo === hi) return a;
  const b = s[hi]!;
  return a + (b - a) * (idx - lo);
}

export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

/**
 * Median absolute deviation about `center`, scaled by 1.4826 so it estimates
 * the standard deviation of normally distributed data.
 */
export function mad(values: readonly number[], center: number): number {
  if (values.length === 0) throw new RangeError("mad() needs at least one value");
  return 1.4826 * median(values.map((v) => Math.abs(v - center)));
}
