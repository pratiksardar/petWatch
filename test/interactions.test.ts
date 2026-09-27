import assert from "node:assert/strict";
import { test } from "node:test";

import { InteractionDetector, detectInteractions } from "../src/interactions.ts";
import type { Sample } from "../src/types.ts";

const BASE = Date.UTC(2026, 0, 1);
const STEP = 50; // matches the firmware's 20 Hz publish rate

/**
 * Piecewise trace builder: [fromMs inclusive, toMs exclusive, mm].
 * Segments must tile the span with no holes — except where a hole is the test
 * (a NaN mm, or a deliberately skipped span to simulate a stream gap).
 */
function walk(segments: readonly (readonly [number, number, number])[]): Sample[] {
  const out: Sample[] = [];
  for (const [fromMs, toMs, mm] of segments) {
    for (let t = BASE + fromMs; t < BASE + toMs; t += STEP) {
      out.push({ t, mm });
    }
  }
  return out;
}

test("counts a sustained nose-touch as one interaction", () => {
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 5_000, 45],
    [5_000, 9_000, 1_150],
  ]);

  const out = detectInteractions(samples);

  assert.equal(out.length, 1);
  const a = out[0]!;
  // Starts at the first close sample, not the confirming one.
  assert.equal(a.startedAt, BASE + 1_000);
  assert.equal(a.endedAt, BASE + 4_950);
  assert.ok(a.durationMs >= 3_900 && a.durationMs <= 4_000, `got ${a.durationMs}`);
  assert.equal(a.minMm, 45);
  assert.ok(a.sampleCount >= 75, `got ${a.sampleCount}`);
});

test("the default rule demands 3 seconds: a 2-second touch is not counted", () => {
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 3_000, 45],
    [3_000, 8_000, 1_150],
  ]);

  assert.deepEqual(detectInteractions(samples), []);
});

test("the same 2-second touch counts once the duration gate is lowered", () => {
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 3_000, 45],
    [3_000, 8_000, 1_150],
  ]);

  const out = detectInteractions(samples, { minDurationMs: 250 });

  assert.equal(out.length, 1);
  assert.equal(out[0]!.startedAt, BASE + 1_000);
});

test("a single close spike is noise, not an interaction", () => {
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 1_050, 40],
    [1_050, 3_000, 1_150],
  ]);

  assert.deepEqual(detectInteractions(samples), []);
});

test("rapid repeat touches within the merge window amass one interaction", () => {
  // Three 1 s touches, 1 s apart: individually under the 3 s gate, but the
  // merge window folds them into one 5 s episode that clears it.
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 2_000, 45],
    [2_000, 3_000, 1_150],
    [3_000, 4_000, 45],
    [4_000, 5_000, 1_150],
    [5_000, 6_000, 45],
    [6_000, 10_000, 1_150],
  ]);

  const out = detectInteractions(samples);

  assert.equal(out.length, 1, "nosing around a bowl is one episode, not three");
  assert.ok(out[0]!.durationMs > 4_500, `got ${out[0]!.durationMs}`);
});

test("touches separated by a real absence count separately", () => {
  // Two 4 s touches with a 4 s absence (> mergeGap) between them.
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 5_000, 45],
    [5_000, 9_000, 1_150],
    [9_000, 13_000, 45],
    [13_000, 18_000, 1_150],
  ]);

  const out = detectInteractions(samples);

  assert.equal(out.length, 2);
  assert.equal(out[0]!.startedAt, BASE + 1_000);
  assert.equal(out[1]!.startedAt, BASE + 9_000);
});

test("hysteresis holds a nose hovering in the exit band inside one episode", () => {
  // 65 mm is above the 60 mm entry bar but inside the 80 mm exit bar: the
  // episode must stay open across it, and the hover counts toward the span.
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 3_000, 45],
    [3_000, 5_000, 65],
    [5_000, 7_000, 45],
    [7_000, 11_000, 1_150],
  ]);

  const out = detectInteractions(samples);

  assert.equal(out.length, 1);
  assert.ok(out[0]!.durationMs > 5_500, `got ${out[0]!.durationMs}`);
});

test("sensor dropouts mid-episode neither count nor end it", () => {
  const samples = [
    ...walk([
      [0, 1_000, 1_150],
      [1_000, 3_000, 45],
    ]),
    ...walk([[3_000, 3_500, Number.NaN]]),
    ...walk([
      [3_500, 5_500, 45],
      [5_500, 9_500, 1_150],
    ]),
  ];

  const out = detectInteractions(samples);

  assert.equal(out.length, 1);
  assert.ok(out[0]!.durationMs > 4_000, `got ${out[0]!.durationMs}`);
  // Dropouts are not range readings and must not inflate the count.
  assert.ok(out[0]!.sampleCount < 90, `got ${out[0]!.sampleCount}`);
});

test("a stream discontinuity closes the episode instead of bridging it", () => {
  const samples = [
    ...walk([
      [0, 1_000, 1_150],
      [1_000, 5_000, 45],
    ]),
    // 15 s hole: device restart or transport drop.
    ...walk([
      [20_000, 24_000, 45],
      [24_000, 28_500, 1_150],
    ]),
  ];

  const out = detectInteractions(samples);

  assert.equal(out.length, 2);
  assert.equal(out[0]!.startedAt, BASE + 1_000);
  assert.equal(out[1]!.startedAt, BASE + 20_000);
});

test("thresholds are configurable for a different mount geometry", () => {
  // Sensor mounted right over the bowl: noses read ~100 mm.
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 5_000, 100],
    [5_000, 9_000, 1_150],
  ]);

  const out = detectInteractions(samples, { interactionMm: 120, exitMm: 150 });

  assert.equal(out.length, 1);
  assert.equal(out[0]!.minMm, 100);
});

test("a reading in the exit band but above the entry bar never opens an episode", () => {
  const samples = walk([[0, 5_000, 70]]);

  assert.deepEqual(detectInteractions(samples), []);
});

test("constructor rejects an inverted hysteresis band", () => {
  assert.throws(() => new InteractionDetector({ interactionMm: 100 }), RangeError);
  assert.throws(() => new InteractionDetector({ interactionMm: 90, exitMm: 80 }), RangeError);
});

test("batch and streaming APIs agree exactly", () => {
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 5_000, 45],
    [5_000, 9_000, 1_150],
    [9_000, 13_000, 50],
    [13_000, 18_000, 1_150],
  ]);

  const detector = new InteractionDetector({ minDurationMs: 250 });
  const streamed = [];
  for (const sample of samples) {
    const out = detector.push(sample);
    if (out !== null) streamed.push(out);
  }
  const tail = detector.flush();
  if (tail !== null) streamed.push(tail);

  assert.equal(streamed.length, 2);
  assert.deepEqual(streamed, detectInteractions(samples, { minDurationMs: 250 }));
});

test("flush emits an episode still open at end of stream", () => {
  const detector = new InteractionDetector();
  const samples = walk([
    [0, 1_000, 1_150],
    [1_000, 5_000, 45],
  ]);
  let seen = 0;
  for (const sample of samples) {
    if (detector.push(sample) !== null) seen++;
  }

  const tail = detector.flush();
  assert.equal(seen, 0, "nothing may emit while the merge window is open");
  assert.ok(tail !== null);
  assert.equal(tail.startedAt, BASE + 1_000);
  assert.ok(tail.durationMs >= 3_900, `got ${tail.durationMs}`);
});

test("flush withholds an open episode that never reached the duration gate", () => {
  const detector = new InteractionDetector();
  for (const sample of walk([[0, 1_000, 1_150]])) detector.push(sample);
  for (const sample of walk([[1_000, 3_000, 45]])) detector.push(sample);

  assert.equal(detector.flush(), null, "2 s in-zone is observed, not counted");
});
