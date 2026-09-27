import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Background, Body, Chip, Eyebrow, Headline, useSpring} from '../components/ui';
import {colors} from '../theme';

export const Team: React.FC = () => {
  const frame = useCurrentFrame();
  const card = useSpring(0, 16);
  const zoom = interpolate(frame, [0, 180], [1.12, 1.24]);
  return (
    <AbsoluteFill>
      <Background glow={[28, 50]} />
      <AbsoluteFill style={{left: 200, top: 110}}>
        <div
          style={{
            width: 540,
            height: 860,
            borderRadius: 36,
            overflow: 'hidden',
            border: '1.5px solid rgba(52,245,164,0.35)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.7), 0 0 80px rgba(52,245,164,0.14)',
            opacity: card,
            transform: `translateY(${(1 - card) * 60}px) rotate(${(1 - card) * -4}deg)`,
          }}
        >
          <Img
            src={staticFile('team.jpg')}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '50% 40%',
              transform: `scale(${zoom})`,
              transformOrigin: '58% 42%',
            }}
          />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{left: 860, top: 300, width: 900, gap: 30}}>
        <Eyebrow delay={8}>The team</Eyebrow>
        <Headline text="Built by humans. *Tested* by a very good dog." delay={12} size={84} />
        <Body delay={30} width={820}>
          Sensor, firmware, detector and dashboard, shipped with Claude Code as the extra pair of hands.
        </Body>
        <div style={{display: 'flex', gap: 16, marginTop: 10}}>
          <Chip delay={50}>Chief Testing Officer</Chip>
          <Chip delay={58} color={colors.amber}>
            3 visits · 0 complaints
          </Chip>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
