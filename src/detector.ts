import { mad, percentile } from "./stats.ts";
import type { Sample, Visit } from "./types.ts";

/**
 * Detector tuning. All distances in mm, all durations in ms.
 *
 * The defaults assume a sensor mounted ~1.15 m from the far surface, sampled at
 * 20 Hz, with the box empty on boot. The first thing to calibrate on real data
 * is `minEnterDeltaMm`.
 */
export const DETECTOR_DEFAULTS = {
  /** Floor on the entry threshold, regardless of how quiet the sensor is. */
  minEnterDeltaMm: 150,
  /** Multiplier on the measured noise sigma when the sensor is noisy. */
  noiseMultiplier: 4,
  /**
   * Exit at this fraction of the entry threshold. This is the hysteresis that
   * stops a subject sitting exactly at the threshold from flickering in and out.
   */
  exitFraction: 0.6,
  /** Visits shorter than this are blips, not visits. */
  minDurationMs: 1500,
  /** Occupied runs separated by less than this are one visit, not two. */
  mergeGapMs: 2500,
  /** A gap in the stream longer than this is a discontinuity, not a quiet spell. */
  maxSampleGapMs: 10_000,
  /** EWMA rate for the baseline. Applied only to samples classified empty. */
  baselineAlpha: 0.01,
  /** Samples used to establish the baseline on start-up. Assumed empty. */
  seedSamples: 200,
  /** Consecutive over-threshold samples needed to confirm entry. */
  enterSamples: 3,
  /** Noise estimate used when the seed window is too quiet to measure one. */
  fallbackSigmaMm: 30,
  /**
   * Half-width, in sigma, of the band around the baseline treated as
   * confidently empty. See `#adaptBaseline` for why this is not simply
   * "below the entry threshold".
   */
  quietBandSigma: 3,
  /** Floor on the quiet band, so a very quiet sensor still adapts at all. */
  minQuietBandMm: 25,
} as const;

/**
 * Overridable tuning knobs.
 *
 * Keys are constrained to the known defaults, but the values are widened to
 * `number`. Deriving this as `Partial<typeof DETECTOR_DEFAULTS>` would be the
 * obvious move and is wrong: `as const` makes each default a literal type, so
 * the only legal override for `enterSamples` would be `3`.
 */
export type DetectorOptions = Partial<Record<keyof typeof DETECTOR_DEFAULTS, number>>;

/** Fully resolved tuning. */
type DetectorConfig = Record<keyof typeof DETECTOR_DEFAULTS, number>;

type State = "seeding" | "idle" | "occupied" | "closing";

/**
 * Streaming visit detector.
 *
 * Feed it samples in time order; it emits a `Visit` when one has provably
 * ended. Emission is deliberately not immediate: a visit can only be declared
 * over once `mergeGapMs` has passed without a return, which is what lets a
 * subject that repositions mid-visit stay a single visit.
 *
 * The class is the single implementation. `detectVisits()` is a thin array
 * adapter over it so that batch and live use cannot drift apart.
 */
export class VisitDetector {
  readonly #o: DetectorConfig;

  #state: State = "seeding";
  #seed: Sample[] = [];
  #baselineMm = Number.NaN;
  #enterDeltaMm = Number.NaN;
  #sigmaMm = Number.NaN;

  /** Range readings belonging to the visit currently being built. */
  #acc: Sample[] = [];
  /** Index in `#acc` of the most recent sample that was still "present". */
  #lastPresentIdx = -1;
  /** Run of over-threshold samples waiting to confirm an entry or a return. */
  #pending: Sample[] = [];
  /** When the current closing window began, or null when not closing. */
  #closeAt: number | null = null;
  #lastT: number | null = null;

  constructor(options: DetectorOptions = {}) {
    this.#o = { ...DETECTOR_DEFAULTS, ...options };
  }

  /**
   * Baseline distance with nothing in the beam. NaN until seeding completes.
   * Exposed for calibration output and for asserting that long visits do not
   * drag it toward the subject.
   */
  get baselineMm(): number {
    return this.#baselineMm;
  }

  /** Effective entry threshold after noise adaptation. NaN until seeded. */
  get enterDeltaMm(): number {
    return this.#enterDeltaMm;
  }

  /**
   * Feed one sample. Returns a Visit when this sample closed one, else null.
   */
  push(sample: Sample): Visit | null {
    let emitted: Visit | null = null;

    if (this.#lastT !== null && sample.t - this.#lastT > this.#o.maxSampleGapMs) {
      // A gap this large means the device restarted or the transport dropped,
      // not that nothing happened. Close out whatever was open, and start the
      // idle-side bookkeeping over.
      if (this.#state === "occupied" || this.#state === "closing") {
        emitted = this.#finalize();
      } else {
        this.#seed.length = 0;
        this.#pending.length = 0;
        this.#state = "seeding";
      }
    }
    this.#lastT = sample.t;

    // Ultrasonic timeouts surface as NaN or Infinity. They carry no range
    // information, so they must never touch the baseline — but they must not
    // end a visit either, because a pet in the box is exactly when dropouts are
    // most likely.
    if (!Number.isFinite(sample.mm)) return emitted;

    if (this.#state === "seeding") {
      this.#seed.push(sample);
      if (this.#seed.length >= this.#o.seedSamples) this.#finishSeeding();
      return emitted;
    }

    const deviationMm = this.#baselineMm - sample.mm;

    if (this.#state === "occupied") {
      this.#acc.push(sample);
      if (deviationMm >= this.#enterDeltaMm * this.#o.exitFraction) {
        this.#lastPresentIdx = this.#acc.length - 1;
      } else {
        this.#state = "closing";
        this.#closeAt = sample.t;
        this.#pending.length = 0;
      }
      return emitted;
    }

    // Idle or closing: both are looking for a subject to appear. Closing uses
    // the lower bar, so a brief dip does not end the visit it belongs to.
    const bar =
      this.#state === "closing" ? this.#enterDeltaMm * this.#o.exitFraction : this.#enterDeltaMm;

    if (deviationMm >= bar) {
      this.#pending.push(sample);
    } else {
      this.#pending.length = 0;
    }

    if (this.#pending.length >= this.#o.enterSamples) {
      if (this.#state === "idle") {
        this.#acc = [...this.#pending];
      } else {
        this.#acc.push(...this.#pending);
        this.#closeAt = null;
      }
      this.#lastPresentIdx = this.#acc.length - 1;
      this.#state = "occupied";
      this.#pending.length = 0;
      return emitted;
    }

    if (
      this.#state === "closing" &&
      this.#closeAt !== null &&
      sample.t - this.#closeAt > this.#o.mergeGapMs
    ) {
      emitted = this.#finalize();
    }

    this.#adaptBaseline(sample.mm, deviationMm);
    return emitted;
  }

  /**
   * End of stream: emit any visit still open. Distinct from a discontinuity,
   * which also finalizes but is caused by missing data rather than by a
   * deliberate end.
   */
  flush(): Visit | null {
    const emitted =
      this.#state === "occupied" || this.#state === "closing" ? this.#finalize() : null;
    this.#lastT = null;
    return emitted;
  }

  #finishSeeding(): void {
    const mm = this.#seed.map((s) => s.mm);

    // Seed deliberately LOW, at the 25th percentile.
    //
    // The asymmetry is the whole point. A baseline that is too HIGH makes every
    // genuinely empty reading look "closer than empty" — that is, permanently
    // occupied — and nothing can correct it, because adaptation only ever runs
    // on samples already classified empty. A baseline that is too LOW
    // self-corrects: empty readings are seen as such and pull it upward within
    // seconds. So err low.
    this.#baselineMm = percentile(mm, 0.25);

    const quiet = mm.filter((v) => Math.abs(v - this.#baselineMm) < this.#o.minEnterDeltaMm);
    const sigma =
      quiet.length >= 4 ? mad(quiet, this.#baselineMm) : this.#o.fallbackSigmaMm;

    this.#sigmaMm = sigma;
    this.#enterDeltaMm = Math.max(this.#o.minEnterDeltaMm, this.#o.noiseMultiplier * sigma);

    this.#state = "idle";
    this.#seed = [];
  }

  /**
   * Fold a sample into the baseline, but only if it is confidently empty.
   *
   * "Below the entry threshold" is NOT the same as "empty". Between the quiet
   * band and the entry threshold lies an ambiguous zone: a subject that
   * interrupts the beam only weakly, or a small pet far from the sensor. If
   * those samples are allowed to train the baseline, they create a feedback
   * loop — the baseline slides toward the subject, the measured deviation
   * shrinks along with it, the subject never clears the entry threshold, and so
   * the samples stay classified as empty and keep dragging the baseline down.
   * The subject becomes permanently undetectable, and the quieter it is the
   * more thoroughly it hides.
   *
   * So the ambiguous zone is evidence of nothing: it neither moves the baseline
   * nor opens a visit. Only unambiguous emptiness teaches the detector what
   * empty looks like.
   */
  #adaptBaseline(mm: number, deviationMm: number): void {
    if (this.#o.baselineAlpha <= 0) return;

    const band = Math.max(
      this.#o.quietBandSigma * this.#sigmaMm,
      this.#o.minQuietBandMm,
    );
    if (Math.abs(deviationMm) > band) return;

    this.#baselineMm += (mm - this.#baselineMm) * this.#o.baselineAlpha;
  }

  #finalize(): Visit | null {
    // Drop the trailing sub-threshold samples that were only retained to time
    // the closing window. They are not evidence the subject was present.
    const acc = this.#lastPresentIdx >= 0 ? this.#acc.slice(0, this.#lastPresentIdx + 1) : [];

    this.#state = "idle";
    this.#acc = [];
    this.#lastPresentIdx = -1;
    this.#pending.length = 0;
    this.#closeAt = null;

    const first = acc[0];
    const last = acc[acc.length - 1];
    if (first === undefined || last === undefined) return null;

    const durationMs = last.t - first.t;
    if (durationMs < this.#o.minDurationMs) return null;

    let sum = 0;
    let minMm = Number.POSITIVE_INFINITY;
    for (const s of acc) {
      sum += s.mm;
      if (s.mm < minMm) minMm = s.mm;
    }
    const meanMm = sum / acc.length;

    let sumSq = 0;
    for (const s of acc) sumSq += (s.mm - meanMm) ** 2;

    return {
      startedAt: first.t,
      endedAt: last.t,
      durationMs,
      sampleCount: acc.length,
      minMm,
      meanMm,
      depthStdDevMm: Math.sqrt(sumSq / acc.length),
    };
  }
}

/** Batch adapter: detect visits across a whole trace. */
export function detectVisits(
  samples: readonly Sample[],
  options: DetectorOptions = {},
): Visit[] {
  const detector = new VisitDetector(options);
  const visits: Visit[] = [];

  for (const sample of samples) {
    const visit = detector.push(sample);
    if (visit !== null) visits.push(visit);
  }

  const final = detector.flush();
  if (final !== null) visits.push(final);

  return visits;
}
