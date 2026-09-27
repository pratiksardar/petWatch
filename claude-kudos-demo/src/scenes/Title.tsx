import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background, Body, Chip, Waveform} from '../components/ui';
import {colors, fonts} from '../theme';

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const letters = 'PET WATCH'.split('');
  return (
    <AbsoluteFill>
      <Background glow={[50, 55]} />
      <AbsoluteFill style={{justifyContent: 'flex-end', paddingBottom: 90}}>
        <Waveform
          width={1920}
          height={260}
          seed="title"
          speed={5}
          draw={interpolate(frame, [0, 60], [0, 1], {extrapolateRight: 'clamp'})}
          opacity={0.35}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 36}}>
        <div style={{display: 'flex'}}>
          {letters.map((l, i) => {
            const s = spring({frame: frame - 4 - i * 2.5, fps, config: {damping: 12, mass: 0.6}});
            return (
              <span
                key={i}
                style={{
                  fontFamily: fonts.display,
                  fontWeight: 700,
                  fontSize: 220,
                  letterSpacing: -6,
                  width: l === ' ' ? 70 : undefined,
                  color: i >= 4 ? colors.green : colors.text,
                  textShadow: i >= 4 ? `0 0 60px ${colors.greenDim}` : 'none',
                  display: 'inline-block',
                  opacity: s,
                  transform: `translateY(${(1 - s) * 120}px) rotateX(${(1 - s) * 70}deg)`,
                }}
              >
                {l}
              </span>
            );
          })}
        </div>
        <div style={{textAlign: 'center'}}>
          <Body delay={30} size={38} width={1200}>
            A non-contact sensor that learns your pet&apos;s normal, and notices the moment it drifts.
          </Body>
        </div>
        <div style={{display: 'flex', gap: 18, marginTop: 10}}>
          {['ESP32-C6', 'Ultrasonic', 'ESPHome', 'Home Assistant'].map((t, i) => (
            <Chip key={t} delay={50 + i * 6}>
              {t}
            </Chip>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
