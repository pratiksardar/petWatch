import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Background, Headline, SonarRings} from '../components/ui';
import {colors, fonts} from '../theme';

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  // A heartbeat monitor line that flatlines into a steady pulse.
  const beat = (frame % 30) / 30;
  const pulse = interpolate(beat, [0, 0.08, 0.3, 1], [1, 1.06, 1, 1]);
  return (
    <AbsoluteFill>
      <Background glow={[50, 50]} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: `scale(${pulse})`}}>
        <SonarRings size={1100} period={30} count={2} opacity={0.22} />
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 28}}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            letterSpacing: 8,
            color: colors.muted,
            opacity: interpolate(frame, [0, 20], [0, 1], {extrapolateRight: 'clamp'}),
          }}
        >
          A PET WATCH STORY
        </div>
        <Headline text="Pets hide illness." delay={12} size={110} align="center" />
        <Headline text="Their *habits* don't." delay={62} size={110} align="center" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
