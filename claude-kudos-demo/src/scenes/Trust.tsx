import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Background, Body, Chip, Eyebrow, Headline, useSpring} from '../components/ui';
import {colors, fonts} from '../theme';

const STATS = [
  {v: 0, suffix: '', label: 'runtime deps'},
  {v: 20, suffix: ' Hz', label: 'raw sampling'},
  {v: 1.5, suffix: ' s', label: 'walk-past filter'},
  {v: 2, suffix: 'σ', label: 'drift alerts'},
];

const Stat: React.FC<{s: (typeof STATS)[number]; delay: number}> = ({s, delay}) => {
  const frame = useCurrentFrame();
  const sp = useSpring(delay, 16);
  const n = interpolate(frame, [delay, delay + 30], [0, s.v], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const shown = Number.isInteger(s.v) ? Math.round(n) : n.toFixed(1);
  return (
    <div
      style={{
        width: 360,
        padding: '36px 34px',
        borderRadius: 28,
        background: colors.panel,
        border: '1.5px solid rgba(52,245,164,0.2)',
        opacity: sp,
        transform: `translateY(${(1 - sp) * 50}px)`,
      }}
    >
      <div style={{fontFamily: fonts.display, fontWeight: 700, fontSize: 96, color: colors.green, lineHeight: 1}}>
        {shown}
        {s.suffix}
      </div>
      <div style={{fontFamily: fonts.mono, fontSize: 21, letterSpacing: 2, color: colors.muted, marginTop: 14}}>
        {s.label.toUpperCase()}
      </div>
    </div>
  );
};

export const Trust: React.FC = () => (
  <AbsoluteFill>
    <Background glow={[50, 70]} />
    <AbsoluteFill style={{alignItems: 'center', top: 130, gap: 26}}>
      <Eyebrow>Built to be trusted</Eyebrow>
      <Headline text="It doesn't diagnose. It *notices.*" size={96} align="center" />
      <div style={{textAlign: 'center'}}>
        <Body delay={26} size={32} width={1250}>
          Every alert is framed as drift from your pet&apos;s own baseline. The call stays with you and your vet.
        </Body>
      </div>
    </AbsoluteFill>
    <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 34, top: 520}}>
      {STATS.map((s, i) => (
        <Stat key={s.label} s={s} delay={50 + i * 12} />
      ))}
    </AbsoluteFill>
    <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 16, top: 860}}>
      {['ESP32-C6', 'ESPHome', 'Home Assistant', 'Node 24', 'node:sqlite', 'TypeScript'].map((t, i) => (
        <Chip key={t} delay={110 + i * 5} color={colors.muted}>
          {t}
        </Chip>
      ))}
    </AbsoluteFill>
  </AbsoluteFill>
);
