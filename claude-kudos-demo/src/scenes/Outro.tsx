import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Background, Headline, SonarRings, useSpring} from '../components/ui';
import {colors, fonts} from '../theme';

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const s = useSpring(40);
  const credit = useSpring(70);
  return (
    <AbsoluteFill>
      <Background glow={[50, 50]} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <SonarRings size={1300} period={70} count={3} opacity={interpolate(frame, [0, 30], [0, 0.3], {extrapolateRight: 'clamp'})} />
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 30}}>
        <Headline text="PET *WATCH*" size={200} align="center" stagger={5} />
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 500,
            fontSize: 54,
            color: colors.text,
            opacity: s,
            transform: `translateY(${(1 - s) * 20}px)`,
          }}
        >
          Notice the drift.
        </div>
        <div
          style={{
            marginTop: 50,
            fontFamily: fonts.mono,
            fontSize: 22,
            letterSpacing: 5,
            color: colors.muted,
            opacity: credit,
          }}
        >
          BUILT WITH CLAUDE CODE
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
