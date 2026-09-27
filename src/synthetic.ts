import type { Sample } from "./types.ts";

/**
 * Deterministic trace generation.
 *
 * Real captures are the ground truth and belong in `traces/`, but you cannot
 * build a detector against a fixture you can only record when the cat feels
 * like it. These generators make every interesting case reproducible — and, for
 * the cases that are physically awkward to stage, possible at all.
 */

/** mulberry32. Small, fast, and repeatable across machines. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, clamped at 4 sigma so a tail draw cannot invent a fake visit. */
function gaussian(next: () => number): number {
  const u = Math.max(next(), Number.EPSILON);
  const v = next();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-4, Math.min(4, g));
}

export type VisitSpec = {
  atMs: number;
  durationMs: number;
  /** How much closer than the empty distance the subject reads, in mm. */
  depthMm: number;
  /** Slow sinusoidal variation on depth — a subject that will not settle. */
  wobbleMm?: number;
  wobblePeriodMs?: number;
  /** Extra per-sample movement on top of the sensor noise. */
  jitterMm?: number;
};

export type TraceSpec = {
  durationMs: number;
  seed?: number;
  /** Epoch ms of the first sample. */
  startAt?: number;
  intervalMs?: number;
  /** Distance to the far surface with nothing in the beam, in mm. */
  emptyMm?: number;
  /** Sensor noise sigma, in mm. */
  noiseMm?: number;
  /** Linear drift of the empty distance — temperature, or litter level falling. */
  driftMmPerMin?: number;
  visits?: readonly VisitSpec[];
  /** Brief interruptions too short to be visits: a tail, a walk-past. */
  blips?: readonly { atMs: number; durationMs: number; depthMm?: number }[];
  /** Windows where the sensor reports no range, as it does on timeout. */
  dropouts?: readonly { atMs: number; durationMs: number }[];
};

const DEFAULT_EMPTY_MM = 1150;
const DEFAULT_NOISE_MM = 6;

/** Build a synthetic sample stream from a spec. */
export function synthTrace(spec: TraceSpec): Sample[] {
  const {
    durationMs,
    seed = 1,
    startAt = 0,
    intervalMs = 50,
    emptyMm = DEFAULT_EMPTY_MM,
    noiseMm = DEFAULT_NOISE_MM,
    driftMmPerMin = 0,
    visits = [],
    blips = [],
    dropouts = [],
  } = spec;

  const next = rng(seed);
  const out: Sample[] = [];

  for (let offset = 0; offset <= durationMs; offset += intervalMs) {
    const t = startAt + offset;

    if (dropouts.some((d) => offset >= d.atMs && offset < d.atMs + d.durationMs)) {
      out.push({ t, mm: Number.NaN });
      continue;
    }

    const empty = emptyMm + (driftMmPerMin * offset) / 60_000;
    const noise = noiseMm * gaussian(next);

    const visit = visits.find((v) => offset >= v.atMs && offset < v.atMs + v.durationMs);
    if (visit !== undefined) {
      let depth = visit.depthMm;
      if (visit.wobbleMm !== undefined) {
        const period = visit.wobblePeriodMs ?? 8000;
        depth += visit.wobbleMm * Math.sin((2 * Math.PI * offset) / period);
      }
      const jitter = (visit.jitterMm ?? 0) * gaussian(next);
      out.push({ t, mm: empty - depth + jitter + noise });
      continue;
    }

    const blip = blips.find((b) => offset >= b.atMs && offset < b.atMs + b.durationMs);
    if (blip !== undefined) {
      out.push({ t, mm: empty - (blip.depthMm ?? 400) + noise });
      continue;
    }

    out.push({ t, mm: empty + noise });
  }

  return out;
}
