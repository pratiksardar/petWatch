import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Background, Body, Chip, Eyebrow, Headline, RollingNumber, VideoCard} from '../components/ui';
import {BENCH, colors, fonts} from '../theme';

const starts = BENCH.map((_, i) => BENCH.slice(0, i).reduce((a, c) => a + c.frames, 0));
export const BENCH_TICK = starts[2] + BENCH[2].tickAt;

const ZOOMS = [
  undefined,
  {from: 1, to: 1.9, x: 26, y: 56, start: 60, end: 200},
  {from: 1.15, to: 2.1, x: 56, y: 37, start: 0, end: 110},
];

const COPY = [
  {
    e: 'Bench test · 01',
    h: 'Raw distance, streamed *live.*',
    b: 'ESPHome pushes 20 Hz over Wi-Fi to a zero-dependency Node dashboard. No cloud in the loop.',
  },
  {
    e: 'Bench test · 02',
    h: 'Baseline learned. Subject *in zone.*',
    b: 'The reading dips below the adaptive threshold and the visit timer starts. Tail swishes under 1.5 s are ignored.',
  },
  {
    e: 'Bench test · 03',
    h: 'Visit *logged.*',
    b: 'Debounced, merged, and written to SQLite with duration and depth features. Nothing to label.',
  },
];

const Counter: React.FC<{tickAt: number}> = ({tickAt}) => {
  return (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 26, marginTop: 20}}>
      <RollingNumber value={8} changedAt={tickAt} size={200} />
      <div style={{fontFamily: fonts.mono, fontSize: 24, letterSpacing: 3, color: colors.muted, paddingBottom: 30}}>
        INTERACTIONS
        <br />
        TODAY
      </div>
    </div>
  );
};

export const Bench: React.FC = () => (
  <AbsoluteFill>
    <Background glow={[75, 45]} />
    {BENCH.map((c, i) => (
      <Sequence key={c.src} from={starts[i]} durationInFrames={c.frames}>
        <AbsoluteFill style={{left: 1130, top: 122}}>
          <VideoCard src={c.src} startFrom={c.startFrom} width={620} zoom={ZOOMS[i] ?? undefined} label="DASHBOARD · :8788" />
        </AbsoluteFill>
        <AbsoluteFill style={{left: 150, top: 230, width: 880, gap: 30}}>
          <Eyebrow delay={4}>{COPY[i].e}</Eyebrow>
          <Headline text={COPY[i].h} delay={8} size={88} />
          <Body delay={22} width={800}>
            {COPY[i].b}
          </Body>
          {i === 1 ? (
            <div style={{display: 'flex', gap: 16, marginTop: 10}}>
              <Chip delay={60}>baseline 140 mm</Chip>
              <Chip delay={75} color={colors.amber}>
                subject 163 mm → in zone
              </Chip>
            </div>
          ) : null}
          {i === 2 ? <Counter tickAt={BENCH[2].tickAt} /> : null}
        </AbsoluteFill>
      </Sequence>
    ))}
  </AbsoluteFill>
);
