import type { Sample } from "./types.ts";

/**
 * Interaction detector tuning. All distances in mm, all durations in ms.
 *
 * Interactions are a different regime from visits, and the difference is
 * absolute rather than relative. A visit is "something entered the beam",
 * measured against this installation's own empty baseline. An interaction is
 * "the pet's nose came within a fixed distance of the sensor" — sniffing the
 * bowl, tipping the dustbin lid, mouthing the water. That question has a
 * physical answer in millimetres, so it does not use the baseline at all and
 * needs no seeding: the detector is usable the second it starts.
 */
export const INTERACTION_DEFAULTS = {
  /**
   * Noses closer than this count as touching the object. 60 mm ≈ 6 cm.
   * This is the number to calibrate on the bench: put the sensor where the
   * pet's muzzle will actually be and measure.
   */
  interactionMm: 60,
  /**
   * Leave the interaction zone beyond this. The hysteresis gap is what stops
   * the count flickering while a nose hovers right at the threshold.
   */
  exitMm: 80,
  /**
   * Close readings must persist this long before an episode may even open.
   * At 20 Hz that is two samples — long enough to reject a single noisy
   * spike, short enough that a real sniff is never missed.
   */
  confirmSamples: 2,
  /**
   * Distinct interactions closer together than this merge into one. A pet
   * nosing around a bowl touches it several times in quick succession; that
   * is one interaction episode, not five.
   */
  mergeGapMs: 3_000,
  /**
   * The "sustained engagement" gate: an episode only COUNTS once the pet has
   * stayed in the zone this long. The default encodes the house rule
   * "within 6 cm for at least 3 seconds". A drive-by sniff that clears the
   * confirm gate but not this one is observed but not counted.
   *
   * Note the interplay with mergeGapMs: returns inside the merge window are
   * folded into one episode, and the SPAN is what is compared against this
   * gate — so a pet that keeps coming back within 3 s gaps amasses one
   * sustained interaction rather than a string of uncounted pecks.
   */
  minDurationMs: 3_000,
  /**
   * A stream gap longer than this ends the episode rather than bridging it:
   * after a dropout we cannot know whether the pet stayed close.
   */
  maxSampleGapMs: 10_000,
} as const;

/** Overridable tuning knobs. Same rationale as DetectorOptions. */
export type InteractionOptions = Partial<
  Record<keyof typeof INTERACTION_DEFAULTS, number>
>;

type InteractionConfig = Record<keyof typeof INTERACTION_DEFAULTS, number>;

/**
 * A counted interaction: one close-approach episode with the object.
 */
export type Interaction = {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  /** Closest approach of the episode, in mm. */
  readonly minMm: number;
  /** Usable range readings that contributed. */
  readonly sampleCount: number;
};

type State = "idle" | "pending" | "active";

/**
 * Streaming close-approach detector.
 *
 * Feed samples in time order; it emits an `Interaction` when one has
 * provably ended (after `mergeGapMs` above the exit threshold). NaN dropouts
 * neither count nor end an episode — ultrasonic dropouts happen exactly when
 * something is very close to the sensor, which is the moment that matters.
 */
export class InteractionDetector {
  readonly #o: InteractionConfig;

  #state: State = "idle";
  #acc: Sample[] = [];
  #closeRun: Sample[] = [];
  #lastCloseT: number | null = null;
  #lastT: number | null = null;

  constructor(options: InteractionOptions = {}) {
    this.#o = { ...INTERACTION_DEFAULTS, ...options };
    // Validate the RESOLVED config, not the overrides: {interactionMm: 100}
    // with the default exitMm of 80 would otherwise silently invert the
    // hysteresis and every episode would end on the next sample.
    if (this.#o.exitMm <= this.#o.interactionMm) {
      throw new RangeError("exitMm must exceed interactionMm (hysteresis needs a gap)");
    }
  }

  /** True while an interaction episode is open (including its merge window). */
  get active(): boolean {
    return this.#state !== "idle";
  }

  /**
   * Feed one sample. Returns an Interaction when this sample closed one.
   *
   * State machine:
   *   idle    — above the exit bar, waiting for a close reading
   *   pending — one or more close readings, waiting for confirmation
   *   active  — confirmed; stays active until the merge window expires
   */
  push(sample: Sample): Interaction | null {
    let emitted: Interaction | null = null;

    // Discontinuity: whatever was open cannot be bridged across it.
    if (this.#lastT !== null && sample.t - this.#lastT > this.#o.maxSampleGapMs) {
      emitted = this.#finalize();
    }
    this.#lastT = sample.t;

    // Dropouts carry no range information. They neither confirm nor end an
    // episode: the merge gap will time it out if the pet really left.
    if (!Number.isFinite(sample.mm)) return emitted;

    const close = sample.mm <= this.#o.interactionMm;
    const near = sample.mm <= this.#o.exitMm;

    if (this.#state === "active") {
      // Only near readings belong to the episode; a far reading is the start
      // of the departure, and the merge gap decides when that is final.
      if (near) {
        this.#acc.push(sample);
        this.#lastCloseT = sample.t;
      } else if (this.#lastCloseT !== null && sample.t - this.#lastCloseT > this.#o.mergeGapMs) {
        emitted = this.#finalize();
      }
      return emitted;
    }

    // idle or pending.
    if (close) {
      this.#closeRun.push(sample);
      if (this.#closeRun.length >= this.#o.confirmSamples) {
        this.#acc = [...this.#closeRun];
        this.#closeRun.length = 0;
        this.#lastCloseT = sample.t;
        this.#state = "active";
      }
    } else {
      this.#closeRun.length = 0;
    }

    return emitted;
  }

  /** End of stream: emit any episode still open. */
  flush(): Interaction | null {
    const emitted = this.#state === "active" ? this.#finalize() : null;
    this.#lastT = null;
    return emitted;
  }

  #finalize(): Interaction | null {
    this.#state = "idle";
    this.#closeRun.length = 0;
    this.#lastCloseT = null;

    const acc = this.#acc;
    this.#acc = [];

    const first = acc[0];
    const last = acc[acc.length - 1];
    if (first === undefined || last === undefined) return null;

    const durationMs = last.t - first.t;
    if (durationMs < this.#o.minDurationMs) return null;

    let minMm = Number.POSITIVE_INFINITY;
    for (const s of acc) {
      if (s.mm < minMm) minMm = s.mm;
    }

    return {
      startedAt: first.t,
      endedAt: last.t,
      durationMs,
      minMm,
      sampleCount: acc.length,
    };
  }
}

/** Batch adapter: count interactions across a whole trace. */
export function detectInteractions(
  samples: readonly Sample[],
  options: InteractionOptions = {},
): Interaction[] {
  const detector = new InteractionDetector(options);
  const out: Interaction[] = [];

  for (const sample of samples) {
    const interaction = detector.push(sample);
    if (interaction !== null) out.push(interaction);
  }

  const tail = detector.flush();
  if (tail !== null) out.push(tail);

  return out;
}
