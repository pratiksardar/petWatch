import assert from "node:assert/strict";
import { test } from "node:test";

import { VisitDetector, detectVisits } from "../src/detector.ts";
import { synthTrace } from "../src/synthetic.ts";
import type { Visit } from "../src/types.ts";

const BASE = Date.UTC(2026, 0, 1);

function collect(samples: readonly { t: number; mm: number }[], options?: object): Visit[] {
  const detector = new VisitDetector(options);
  const visits: Visit[] = [];
  for (const sample of samples) {
    const visit = detector.push(sample);
    if (visit !== null) visits.push(visit);
  }
  const tail = detector.flush();
  if (tail !== null) visits.push(tail);
  return visits;
}

test("detects a single clean visit and reports when it started", () => {
  const samples = synthTrace({
    durationMs: 60_000,
    seed: 1,
    startAt: BASE,
    visits: [{ atMs: 20_000, durationMs: 8_000, depthMm: 500 }],
  });

  const visits = detectVisits(samples, { seedSamples: 100 });

  assert.equal(visits.length, 1);
  const visit = visits[0]!;
  // The first sample of the confirming run is the visit's start, not the third,
  // so the reported span matches what the pet actually did.
  assert.equal(visit.startedAt, BASE + 20_000);
  assert.ok(visit.durationMs >= 7_900 && visit.durationMs <= 8_000, `got ${visit.durationMs}`);
  assert.equal(visit.endedAt - visit.startedAt, visit.durationMs);
  assert.ok(visit.meanMm < 700, `mean should read the subject, got ${visit.meanMm}`);
  assert.ok(visit.minMm >= 600 && visit.minMm <= 700, `got ${visit.minMm}`);
});

test("a quiet stream produces no visits", () => {
  const samples = synthTrace({ durationMs: 120_000, seed: 17, startAt: BASE });
  assert.deepEqual(detectVisits(samples, { seedSamples: 100 }), []);
});

test("ignores a blip too short to confirm entry", () => {
  // 100 ms is two samples at 20 Hz: a tail swishing through the beam.
  const samples = synthTrace({
    durationMs: 30_000,
    seed: 15,
    startAt: BASE,
    blips: [{ atMs: 10_000, durationMs: 100 }],
  });

  assert.deepEqual(detectVisits(samples, { seedSamples: 100 }), []);
});

test("ignores a walk-past long enough to enter but too short to be a visit", () => {
  // 400 ms clears the entry confirmation, so this one has to die at the
  // minimum-duration gate instead. Both gates need coverage.
  const samples = synthTrace({
    durationMs: 30_000,
    seed: 16,
    startAt: BASE,
    blips: [{ atMs: 10_000, durationMs: 400 }],
  });

  assert.deepEqual(detectVisits(samples, { seedSamples: 100 }), []);
});

test("merges fragments separated by a short gap into one visit", () => {
  const samples = synthTrace({
    durationMs: 60_000,
    seed: 3,
    startAt: BASE,
    visits: [
      { atMs: 20_000, durationMs: 5_000, depthMm: 500 },
      { atMs: 26_000, durationMs: 5_000, depthMm: 500 },
    ],
  });

  const visits = detectVisits(samples, { seedSamples: 100, mergeGapMs: 2_500 });

  assert.equal(visits.length, 1, "a 1 s repositioning gap is one visit, not two");
  assert.ok(visits[0]!.durationMs > 10_000, `got ${visits[0]!.durationMs}`);
});

test("splits two visits separated by a long absence", () => {
  const samples = synthTrace({
    durationMs: 90_000,
    seed: 4,
    startAt: BASE,
    visits: [
      { atMs: 20_000, durationMs: 5_000, depthMm: 500 },
      { atMs: 40_000, durationMs: 5_000, depthMm: 500 },
    ],
  });

  const visits = detectVisits(samples, { seedSamples: 100, mergeGapMs: 2_500 });

  assert.equal(visits.length, 2);
  assert.equal(visits[0]!.startedAt, BASE + 20_000);
  assert.equal(visits[1]!.startedAt, BASE + 40_000);
});

test("survives sensor dropouts mid-visit without splitting it", () => {
  const samples = synthTrace({
    durationMs: 60_000,
    seed: 5,
    startAt: BASE,
    visits: [{ atMs: 20_000, durationMs: 10_000, depthMm: 500 }],
    dropouts: [{ atMs: 22_000, durationMs: 500 }],
  });

  const visits = detectVisits(samples, { seedSamples: 100 });

  assert.equal(visits.length, 1, "NaN readings must not split a visit");
  assert.ok(visits[0]!.durationMs > 9_000, `got ${visits[0]!.durationMs}`);
  // 10 s at 20 Hz is 200 samples; the 10 dropped ones are not range readings.
  assert.ok(visits[0]!.sampleCount < 200, `got ${visits[0]!.sampleCount}`);
});

test("a five-minute visit never drags the baseline toward the subject", () => {
  // Regression guard for the obvious wrong implementation: a rolling median
  // over a window shorter than a visit collapses onto the subject's distance,
  // occupancy then reads as empty, and the visit silently disappears.
  const detector = new VisitDetector({ seedSamples: 100 });
  const samples = synthTrace({
    durationMs: 420_000,
    seed: 18,
    startAt: BASE,
    visits: [{ atMs: 30_000, durationMs: 300_000, depthMm: 500 }],
  });

  const visits: Visit[] = [];
  for (const sample of samples) {
    const visit = detector.push(sample);
    if (visit !== null) visits.push(visit);
  }

  assert.equal(visits.length, 1);
  assert.ok(visits[0]!.durationMs >= 299_000, `got ${visits[0]!.durationMs}`);
  assert.ok(
    detector.baselineMm > 1_000,
    `baseline drifted toward the subject: ${detector.baselineMm}`,
  );
  assert.ok(
    detector.baselineMm < 1_300,
    `baseline over-corrected: ${detector.baselineMm}`,
  );
});

test("baseline follows slow drift and still detects visits", () => {
  const detector = new VisitDetector({ seedSamples: 100, baselineAlpha: 0.02 });
  const samples = synthTrace({
    durationMs: 600_000,
    seed: 19,
    startAt: BASE,
    driftMmPerMin: 40,
    visits: [{ atMs: 500_000, durationMs: 8_000, depthMm: 500 }],
  });

  const visits: Visit[] = [];
  for (const sample of samples) {
    const visit = detector.push(sample);
    if (visit !== null) visits.push(visit);
  }

  assert.equal(visits.length, 1, "drift must not be mistaken for occupancy");
  assert.ok(
    detector.baselineMm > 1_400,
    `baseline should have followed the drift, got ${detector.baselineMm}`,
  );
});

test("hysteresis holds a subject at the threshold together as one visit", () => {
  // Depth oscillates either side of the 150 mm entry threshold. With hysteresis
  // the exit bar is 60% of entry, so the subject never leaves. Without it, each
  // trough is long enough to end the visit and it fragments.
  const samples = synthTrace({
    durationMs: 60_000,
    seed: 9,
    startAt: BASE,
    visits: [
      {
        atMs: 20_000,
        durationMs: 30_000,
        depthMm: 130,
        wobbleMm: 30,
        wobblePeriodMs: 8_000,
      },
    ],
  });

  const withHysteresis = detectVisits(samples, { seedSamples: 100 });
  assert.equal(withHysteresis.length, 1, "hysteresis should hold the visit together");

  const withoutHysteresis = detectVisits(samples, { seedSamples: 100, exitFraction: 1 });
  assert.ok(
    withoutHysteresis.length > 1,
    `without hysteresis this should fragment, got ${withoutHysteresis.length}`,
  );
});

test("depthStdDevMm separates a settled subject from a restless one", () => {
  const build = (jitterMm: number) =>
    synthTrace({
      durationMs: 40_000,
      seed: 11,
      startAt: BASE,
      visits: [{ atMs: 10_000, durationMs: 12_000, depthMm: 500, jitterMm }],
    });

  const settled = detectVisits(build(0), { seedSamples: 100 });
  const restless = detectVisits(build(40), { seedSamples: 100 });

  assert.equal(settled.length, 1);
  assert.equal(restless.length, 1);
  assert.ok(
    restless[0]!.depthStdDevMm > settled[0]!.depthStdDevMm * 3,
    `restless ${restless[0]!.depthStdDevMm} vs settled ${settled[0]!.depthStdDevMm}`,
  );
});

test("a stream discontinuity closes an open visit instead of merging across it", () => {
  const first = synthTrace({
    durationMs: 20_000,
    seed: 12,
    startAt: BASE,
    visits: [{ atMs: 10_000, durationMs: 8_000, depthMm: 500 }],
  });
  const second = synthTrace({
    durationMs: 20_000,
    seed: 13,
    startAt: BASE + 80_000,
    visits: [{ atMs: 10_000, durationMs: 8_000, depthMm: 500 }],
  });

  const visits = detectVisits([...first, ...second], { seedSamples: 100 });

  assert.equal(visits.length, 2, "a 60 s hole in the stream is not a quiet spell");
  assert.equal(visits[1]!.startedAt, BASE + 90_000);
});

test("a subject just below the entry threshold cannot train the baseline toward itself", () => {
  // Regression guard. A weak interruption reads ~120 mm closer, under the
  // 150 mm entry threshold. Treating those samples as evidence about "empty"
  // starts a feedback loop: the baseline follows the subject down, the measured
  // deviation shrinks along with it, the subject never clears the threshold, and
  // so the samples stay classified empty and keep pulling the baseline down.
  // The subject becomes permanently undetectable.
  const detector = new VisitDetector({ seedSamples: 100 });
  const samples = synthTrace({
    durationMs: 180_000,
    seed: 22,
    startAt: BASE,
    visits: [
      { atMs: 20_000, durationMs: 120_000, depthMm: 120 },
      { atMs: 150_000, durationMs: 8_000, depthMm: 500 },
    ],
  });

  const visits: Visit[] = [];
  let baselineDuringWeakWindow = Number.NaN;

  for (const sample of samples) {
    const visit = detector.push(sample);
    if (visit !== null) visits.push(visit);
    // Sampled at the end of the weak-interruption window. Reading the baseline
    // at the end of the trace instead would not work: the quiet tail afterwards
    // adapts it back up and masks the sag entirely.
    if (sample.t === BASE + 139_950) baselineDuringWeakWindow = detector.baselineMm;
  }
  const tail = detector.flush();
  if (tail !== null) visits.push(tail);

  // With the feedback loop present this converges onto the subject's own
  // distance (~1030) rather than staying on the empty box (~1150).
  assert.ok(
    baselineDuringWeakWindow > 1_100,
    `baseline sagged toward the weak subject: ${baselineDuringWeakWindow}`,
  );
  assert.equal(visits.length, 1, "the weak subject must not hide a later real visit");
  assert.equal(visits[0]!.startedAt, BASE + 150_000);
});

test("a stream shorter than the seed window yields nothing rather than a guess", () => {
  const samples = synthTrace({
    durationMs: 2_000,
    seed: 14,
    startAt: BASE,
    visits: [{ atMs: 0, durationMs: 2_000, depthMm: 500 }],
  });

  assert.deepEqual(detectVisits(samples, { seedSamples: 200 }), []);
});

test("batch and streaming APIs agree exactly", () => {
  const samples = synthTrace({
    durationMs: 120_000,
    seed: 21,
    startAt: BASE,
    visits: [
      { atMs: 20_000, durationMs: 9_000, depthMm: 480 },
      { atMs: 60_000, durationMs: 6_000, depthMm: 520 },
      { atMs: 90_000, durationMs: 4_000, depthMm: 500 },
    ],
  });

  const batch = detectVisits(samples, { seedSamples: 100 });
  const streamed = collect(samples, { seedSamples: 100 });

  assert.equal(batch.length, 3);
  assert.deepEqual(streamed, batch);
});
