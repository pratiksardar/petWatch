import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Background, Eyebrow, Headline, useSpring} from '../components/ui';
import {colors, fonts} from '../theme';

const STEPS = [
  {
    n: '01',
    t: 'Sense',
    b: 'An ultrasonic echo off the bowl or litter box, 20 times a second. The ESP32-C6 streams raw distance.',
    icon: (
      <g fill="none" stroke={colors.green} strokeWidth="4" strokeLinecap="round">
        <circle cx="16" cy="40" r="6" fill={colors.green} />
        <path d="M30 26a20 20 0 0 1 0 28" />
        <path d="M42 16a34 34 0 0 1 0 48" />
        <path d="M54 6a48 48 0 0 1 0 68" />
      </g>
    ),
  },
  {
    n: '02',
    t: 'Detect',
    b: 'A self-correcting baseline, a 1.5 s walk-past filter, and fragments merged into one real visit.',
    icon: (
      <g fill="none" stroke={colors.green} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M4 56h14v-30h22v30h36" />
        <path d="M4 40h72" strokeDasharray="4 7" stroke={colors.amber} />
      </g>
    ),
  },
  {
    n: '03',
    t: 'Learn',
    b: "Your pet's own rhythm, hour by hour. An EWMA flags a 2σ drift, days before symptoms show.",
    icon: (
      <g fill="none" stroke={colors.green} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M4 60l16-10 14 6 16-14 12 4" />
        <path d="M62 46l14-34" stroke={colors.amber} />
        <circle cx="76" cy="12" r="5" fill={colors.amber} stroke="none" />
      </g>
    ),
  },
];

const Card: React.FC<{step: (typeof STEPS)[number]; delay: number}> = ({step, delay}) => {
  const s = useSpring(delay, 15);
  return (
    <div
      style={{
        width: 500,
        padding: 44,
        borderRadius: 32,
        background: colors.panel,
        border: '1.5px solid rgba(52,245,164,0.22)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        opacity: s,
        transform: `translateY(${(1 - s) * 80}px) scale(${0.92 + s * 0.08})`,
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          {step.icon}
        </svg>
        <span style={{fontFamily: fonts.mono, fontSize: 26, color: colors.muted}}>{step.n}</span>
      </div>
      <div style={{fontFamily: fonts.display, fontWeight: 700, fontSize: 58, color: colors.text}}>{step.t}</div>
      <div style={{fontFamily: fonts.body, fontSize: 27, lineHeight: 1.45, color: colors.muted}}>{step.b}</div>
    </div>
  );
};

export const How: React.FC = () => {
  const frame = useCurrentFrame();
  const lineProgress = interpolate(frame, [40, 140], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const dot = ((frame - 40) % 70) / 70;
  return (
    <AbsoluteFill>
      <Background glow={[50, 30]} />
      <AbsoluteFill style={{alignItems: 'center', top: 120, gap: 22}}>
        <Eyebrow>How it works</Eyebrow>
        <Headline text="Echo in. *Insight* out." size={96} align="center" />
      </AbsoluteFill>
      {/* signal path connecting the three stages */}
      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 660,
          width: 1500 * lineProgress,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${colors.green})`,
        }}
      />
      {lineProgress >= 1 ? (
        <div
          style={{
            position: 'absolute',
            left: 210 + 1500 * dot,
            top: 653,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: colors.green,
            boxShadow: `0 0 24px ${colors.green}`,
          }}
        />
      ) : null}
      <AbsoluteFill style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 50, top: 400}}>
        {STEPS.map((s, i) => (
          <Card key={s.n} step={s} delay={24 + i * 22} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
