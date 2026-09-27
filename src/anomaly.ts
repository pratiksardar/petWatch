import { densifyDays } from "./rollup.ts";
import type { AnomalyAlert, AnomalyKind, DailyAggregate } from "./types.ts";

/**
 * Anomaly detection against each individual's own history.
 *
 * This is the layer that carries the value of the whole project, and it needs
 * no labelled data. There is no supervised model here on purpose: labels do not
 * exist yet, and a classifier trained on a week of guesses would be worse than a
 * baseline that is honest about being a baseline.
 */
export const ANOMALY_DEFAULTS = {
  /** EWMA rate for the baseline. Higher adapts faster. */
  ewmaAlpha: 0.3,
  /** Days of history required before any alert is possible. */
  minHistoryDays: 7,
  /** Deviation, in baseline sigma, needed to flag a day. */
  sigmaThreshold: 2,
  /**
   * Consecutive flagged days before anything is raised. A single missed day is
   * noise; alerting on it is how you train the owner to ignore alerts.
   */
  minConsecutiveDays: 2,
  /** Sigma at or above which severity escalates to `concern`. */
  concernSigma: 3,
} as const;

export type AnomalyOptions = Partial<Record<keyof typeof ANOMALY_DEFAULTS, number>>;

type Metric = {
  readonly kind: AnomalyKind;
  readonly label: string;
  readonly value: (d: DailyAggregate) => number;
  /**
   * Minimum standard deviation for this metric.
   *
   * Without a floor, a very regular pet has a baseline sigma near zero and any
   * one-visit wobble reads as a dozen sigma. The floor is what makes the
   * detector usable on well-behaved animals, which is most of them.
   */
  readonly floor: (mean: number) => number;
  readonly format: (v: number) => string;
};

const METRICS: readonly Metric[] = [
  {
    kind: "frequency",
    label: "visits/day",
    value: (d) => d.visitCount,
    floor: (mean) => Math.max(0.75, mean * 0.15),
    format: (v) => v.toFixed(1),
  },
  {
    // Minutes rather than milliseconds: the numbers stay readable and the floor
    // stays expressible.
    kind: "duration",
    label: "time in box/day",
    value: (d) => d.totalDurationMs / 60_000,
    floor: (mean) => Math.max(0.5, mean * 0.2),
    format: (v) => `${v.toFixed(1)} min`,
  },
  {
    kind: "overnight",
    label: "overnight visits/day",
    value: (d) => d.overnightCount,
    floor: (mean) => Math.max(0.75, mean * 0.2),
    format: (v) => v.toFixed(1),
  },
];

export type Baseline = { readonly mean: number; readonly stdDev: number };

/**
 * EWMA mean and variance, emitting for each index the baseline built from
 * *strictly earlier* values.
 *
 * Strictly earlier matters: a baseline that includes the day being tested
 * launders the anomaly into its own reference and shrinks the deviation. This
 * is the difference between detecting a trend and explaining it away.
 *
 * EWMA rather than a flat mean for a specific reason — a flat mean absorbs a
 * week-long illness into "normal" within about a week, so the second week of a
 * worsening condition looks unremarkable. EWMA keeps recent days weighted more
 * heavily, so a sustained change is detected while it is happening.
 */
export function priorBaselines(values: readonly number[], alpha: number): Baseline[] {
  const out: Baseline[] = [];
  let mean = Number.NaN;
  let variance = 0;
  let seen = 0;

  for (const x of values) {
    out.push({ mean, stdDev: Math.sqrt(variance) });

    if (seen === 0) {
      mean = x;
      variance = 0;
    } else {
      const previousMean = mean;
      mean = (1 - alpha) * mean + alpha * x;
      variance = (1 - alpha) * (variance + alpha * (x - previousMean) ** 2);
    }
    seen += 1;
  }

  return out;
}

type Flag = {
  readonly day: string;
  readonly value: number;
  readonly baselineMean: number;
  readonly baselineStdDev: number;
  readonly sigma: number;
};

/**
 * Find sustained deviations from each individual's own baseline.
 *
 * Days with no visits are filled in rather than skipped, because absence is
 * data: a cat that stops using the box for two days is the single most
 * important thing this system could ever tell you, and a gap-based series
 * cannot see it.
 */
export function detectAnomalies(
  history: readonly DailyAggregate[],
  options: AnomalyOptions = {},
): AnomalyAlert[] {
  const o = { ...ANOMALY_DEFAULTS, ...options };
  const dense = densifyDays(history);
  const alerts: AnomalyAlert[] = [];

  for (const metric of METRICS) {
    const values = dense.map(metric.value);
    const baselines = priorBaselines(values, o.ewmaAlpha);

    const flags: (Flag | null)[] = values.map((value, i) => {
      const baseline = baselines[i]!;

      // No baseline yet, or not enough history to trust one.
      if (i < o.minHistoryDays || !Number.isFinite(baseline.mean)) return null;

      const sigma = Math.max(baseline.stdDev, metric.floor(baseline.mean));
      const deviation = (value - baseline.mean) / sigma;

      if (Math.abs(deviation) < o.sigmaThreshold) return null;

      return {
        day: dense[i]!.day,
        value,
        baselineMean: baseline.mean,
        baselineStdDev: sigma,
        sigma: deviation,
      };
    });

    let run: Flag[] = [];
    const flush = (): void => {
      if (run.length >= o.minConsecutiveDays) {
        alerts.push(buildAlert(metric, run, o.concernSigma));
      }
      run = [];
    };

    for (const flag of flags) {
      if (flag === null) {
        flush();
        continue;
      }
      // A direction flip ends the run. Two days above baseline then two days
      // below is two different stories, not one sustained deviation.
      if (run.length > 0 && Math.sign(flag.sigma) !== Math.sign(run[0]!.sigma)) flush();
      run.push(flag);
    }
    flush();
  }

  return alerts.sort((a, b) =>
    a.windowStart < b.windowStart ? -1 : a.windowStart > b.windowStart ? 1 : 0,
  );
}

function buildAlert(metric: Metric, run: readonly Flag[], concernSigma: number): AnomalyAlert {
  const worst = run.reduce((a, b) => (Math.abs(b.sigma) > Math.abs(a.sigma) ? b : a));
  const last = run[run.length - 1]!;
  const observedMean = run.reduce((sum, f) => sum + f.value, 0) / run.length;
  const direction = worst.sigma > 0 ? "above" : "below";
  const days = run.length;

  return {
    kind: metric.kind,
    severity: Math.abs(worst.sigma) >= concernSigma ? "concern" : "watch",
    direction,
    windowStart: run[0]!.day,
    windowEnd: last.day,
    days,
    observedMean,
    baselineMean: last.baselineMean,
    baselineStdDev: last.baselineStdDev,
    deviationSigma: worst.sigma,
    detail:
      `${metric.label} ${direction} baseline for ${days} day${days === 1 ? "" : "s"}: ` +
      `${metric.format(observedMean)} vs ${metric.format(last.baselineMean)} ` +
      `± ${metric.format(last.baselineStdDev)} ` +
      `(peak ${Math.abs(worst.sigma).toFixed(1)}σ)`,
  };
}
