/** A single raw range reading from the ultrasonic sensor. */
export type Sample = {
  /** Epoch milliseconds. */
  readonly t: number;
  /** Distance to the nearest reflecting surface, in millimetres. May be NaN. */
  readonly mm: number;
};

/**
 * A completed visit, after gap-merging and the minimum-duration filter.
 *
 * Feature choice is deliberate: `durationMs` and `depthStdDevMm` carry most of
 * the signal. The first separates a real visit from a walk-past; the second
 * separates "settled in and using the box" from "circling restlessly", and the
 * restless case is the one worth noticing.
 */
export type Visit = {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  /** Range readings that contributed. Dropouts are not counted. */
  readonly sampleCount: number;
  /** Closest approach during the visit. */
  readonly minMm: number;
  readonly meanMm: number;
  /**
   * Standard deviation of in-visit range readings, in millimetres — reported as
   * a deviation rather than a variance because "readings moved by 40 mm" is
   * directly interpretable and "1600 mm²" is not.
   */
  readonly depthStdDevMm: number;
};

/** One day of visit history, as stored in the `daily_rollup` table. */
export type DailyAggregate = {
  /** `YYYY-MM-DD` in the device's local time. */
  readonly day: string;
  readonly visitCount: number;
  readonly totalDurationMs: number;
  /** Visits started inside the overnight window. */
  readonly overnightCount: number;
};

export type AnomalyKind = "frequency" | "duration" | "overnight";

/**
 * A sustained deviation from one individual's own baseline.
 *
 * Deliberately not a diagnosis. Absolute clinical numbers vary with species,
 * size, age and medication, so every alert is phrased as deviation from this
 * pet's normal and the judgement stays with the owner.
 */
export type AnomalyAlert = {
  readonly kind: AnomalyKind;
  /** `watch` for a clear deviation, `concern` once it is far outside. */
  readonly severity: "watch" | "concern";
  readonly direction: "above" | "below";
  readonly windowStart: string;
  readonly windowEnd: string;
  /** How many consecutive days the deviation lasted. */
  readonly days: number;
  readonly observedMean: number;
  readonly baselineMean: number;
  readonly baselineStdDev: number;
  /** Largest deviation in the run, in baseline standard deviations. */
  readonly deviationSigma: number;
  readonly detail: string;
};
