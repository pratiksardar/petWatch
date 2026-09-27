import assert from "node:assert/strict";
import { test } from "node:test";

import { mad, median, percentile, sortedAsc } from "../src/stats.ts";

test("sortedAsc copies rather than mutating", () => {
  const input = [3, 1, 2];
  assert.deepEqual(sortedAsc(input), [1, 2, 3]);
  assert.deepEqual(input, [3, 1, 2], "input must be untouched");
});

test("percentile interpolates and hits the endpoints", () => {
  const values = [10, 20, 30, 40];
  assert.equal(percentile(values, 0), 10);
  assert.equal(percentile(values, 1), 40);
  assert.equal(percentile(values, 0.5), 25);
  assert.equal(percentile(values, 0.25), 17.5);
});

test("percentile rejects an empty input instead of returning NaN", () => {
  // A silent NaN here becomes a silently blind detector, so it must throw.
  assert.throws(() => percentile([], 0.5), RangeError);
  assert.equal(median([5]), 5);
});

test("percentile rejects an out-of-range p", () => {
  assert.throws(() => percentile([1, 2, 3], 1.5), RangeError);
  assert.throws(() => percentile([1, 2, 3], -0.1), RangeError);
});

test("median resists one-sided outliers that would move a mean", () => {
  const clean = [1_146, 1_150, 1_154, 1_158, 1_162];
  const withReflection = [...clean, 300]; // a spurious short return
  const mean = withReflection.reduce((a, b) => a + b, 0) / withReflection.length;

  // Even-length input: the median interpolates to the midpoint of the pair.
  assert.equal(median(withReflection), 1_152);
  assert.ok(mean < median(withReflection), "the mean is dragged, the median is not");
});

test("mad applies the 1.4826 consistency factor to the raw median deviation", () => {
  const values = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
  assert.equal(median(values.map((v) => Math.abs(v))), 1);
  assert.equal(mad(values, 0), 1.4826);
});

test("mad scales linearly with the spread of the data", () => {
  const tight = [-1, -0.5, 0, 0.5, 1];
  const wide = tight.map((v) => v * 10);
  assert.equal(mad(wide, 0), mad(tight, 0) * 10);
});

test("mad collapses on a perfectly quiet signal", () => {
  assert.equal(mad([1_150, 1_150, 1_150], 1_150), 0);
});
