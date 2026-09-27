import type { DailyAggregate, Visit } from "./types.ts";

/**
 * Where a timestamp falls on the wall clock.
 *
 * Deliberately a single injected function rather than a UTC-offset integer
 * scattered through the code. Tests pin it and stay deterministic; the real
 * device passes a fixed offset. Note that a fixed offset is wrong across a
 * DST transition — for a pet journal that costs at most one misassigned visit
 * twice a year, which is an acceptable trade for not carrying a timezone
 * database.
 */
export type LocalTime = (t: number) => { day: string; hour: number };

export function fixedOffsetLocalTime(utcOffsetMinutes = 0): LocalTime {
  return (t) => {
    const shifted = new Date(t + utcOffsetMinutes * 60_000);
    return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
  };
}

export type RollupOptions = {
  localTime?: LocalTime;
  /** Overnight window start, in local hours. Default 0. */
  overnightStartHour?: number;
  /** Overnight window end, in local hours, exclusive. Default 6. */
  overnightEndHour?: number;
};

/**
 * Aggregate visits into one row per day, ascending by day.
 *
 * A visit belongs to the day it *started*, even if it runs past midnight. That
 * is the right call for a litter box: a trip that begins at 23:58 is part of
 * that evening's pattern, not the next morning's.
 *
 * Overnight visits are counted separately because they carry outsized signal —
 * a cat waking to use the box repeatedly is worth noticing even when the daily
 * total looks unremarkable.
 */
export function rollupByDay(
  visits: readonly Visit[],
  options: RollupOptions = {},
): DailyAggregate[] {
  const {
    localTime = fixedOffsetLocalTime(0),
    overnightStartHour = 0,
    overnightEndHour = 6,
  } = options;

  const buckets = new Map<string, { count: number; totalMs: number; overnight: number }>();

  for (const visit of visits) {
    const { day, hour } = localTime(visit.startedAt);
    const bucket = buckets.get(day) ?? { count: 0, totalMs: 0, overnight: 0 };

    bucket.count += 1;
    bucket.totalMs += visit.durationMs;
    if (hour >= overnightStartHour && hour < overnightEndHour) bucket.overnight += 1;

    buckets.set(day, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, b]) => ({
      day,
      visitCount: b.count,
      totalDurationMs: b.totalMs,
      overnightCount: b.overnight,
    }));
}

/**
 * Fill gaps in a rollup series with zero days.
 *
 * Without this, a day with no visits vanishes from the series entirely and the
 * anomaly layer never sees the most interesting observation it could: that
 * nothing happened. Absence is data.
 */
export function densifyDays(series: readonly DailyAggregate[]): DailyAggregate[] {
  if (series.length === 0) return [];

  const byDay = new Map(series.map((d) => [d.day, d]));
  const first = series[0]!.day;
  const last = series[series.length - 1]!.day;

  const out: DailyAggregate[] = [];
  const cursor = new Date(`${first}T00:00:00.000Z`);
  const end = new Date(`${last}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, visitCount: 0, totalDurationMs: 0, overnightCount: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}
