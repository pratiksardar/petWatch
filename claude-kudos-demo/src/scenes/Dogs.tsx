import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, interpolate, random, staticFile, useCurrentFrame} from 'remotion';
import {Background, Body, Eyebrow, Headline, RollingNumber, VideoCard, Waveform, useSpring} from '../components/ui';
import {DOG_CLIPS, colors, fonts} from '../theme';

const COPY = [
  {h: 'Meet our *beta* tester.', b: 'Sensor clipped above the water bowl. Every lean-in shortens the echo.'},
  {h: 'Every sip, *noticed.*', b: 'Distance drops under the learned baseline, the visit timer starts, the count ticks up. Live.'},
  {h: 'No camera. Just *echoes.*', b: 'Ultrasound only knows distance and time, which is exactly what habits are made of.'},
];

const starts = DOG_CLIPS.map((_, i) => DOG_CLIPS.slice(0, i).reduce((a, c) => a + c.frames, 0));
export const VISIT_TICKS = starts.map((s) => s + 20);

const Tile: React.FC<{label: string; children: React.ReactNode; delay: number; accent?: boolean}> = ({
  label,
  children,
  delay,
  accent,
}) => {
  const s = useSpring(delay);
  return (
    <div
      style={{
        flex: 1,
        padding: '26px 28px',
        borderRadius: 24,
        background: colors.panel,
        border: `1.5px solid ${accent ? colors.green + '66' : 'rgba(255,255,255,0.08)'}`,
        opacity: s,
        transform: `translateY(${(1 - s) * 30}px)`,
      }}
    >
      <div style={{fontFamily: fonts.mono, fontSize: 17, letterSpacing: 3, color: colors.muted, marginBottom: 14}}>
        {label}
      </div>
      {children}
    </div>
  );
};

export const Dogs: React.FC = () => {
  const frame = useCurrentFrame();
  const idx = Math.max(0, starts.findLastIndex((s) => frame >= s));
  const clip = DOG_CLIPS[idx];
  const local = frame - starts[idx];
  const t = local / clip.frames;
  const k = t * (clip.mm.length - 1);
  const base = interpolate(k, clip.mm.map((_, i) => i), [...clip.mm]);
  const mm = Math.round(base + (random(`mm-${Math.floor(frame / 3)}`) - 0.5) * 18);
  const pillPulse = 0.6 + 0.4 * Math.sin(frame / 5);

  return (
    <AbsoluteFill>
      <Background glow={[22, 50]} />
      {DOG_CLIPS.map((c, i) => (
        <Sequence key={c.src} from={starts[i]} durationInFrames={c.frames}>
          <AbsoluteFill style={{opacity: 0.22, filter: 'blur(60px) saturate(1.4)', transform: 'scale(1.3)'}}>
            <OffthreadVideo src={staticFile(c.src)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          </AbsoluteFill>
          <AbsoluteFill style={{left: 170, top: 122}}>
            <div style={{opacity: interpolate(frame - starts[i], [0, 8], [i === 0 ? 1 : 0.2, 1], {extrapolateRight: 'clamp'})}}>
              <VideoCard src={c.src} width={620} label={`FIELD TEST · ${c.time}`} />
            </div>
          </AbsoluteFill>
          <AbsoluteFill style={{left: 900, top: 150, width: 860, gap: 26}}>
            <Eyebrow delay={4}>Live · Bowl mode · Visit {c.visits}</Eyebrow>
            <Headline text={COPY[i].h} delay={8} size={84} />
            <Body delay={20} width={820}>
              {COPY[i].b}
            </Body>
          </AbsoluteFill>
        </Sequence>
      ))}

      <AbsoluteFill style={{left: 900, top: 600, width: 860, height: 340, gap: 22}}>
        <div style={{display: 'flex', gap: 22}}>
          <Tile label="VISITS TODAY" delay={24} accent>
            <RollingNumber value={clip.visits} changedAt={VISIT_TICKS[idx]} size={84} />
          </Tile>
          <Tile label="DISTANCE" delay={30}>
            <div style={{fontFamily: fonts.display, fontWeight: 700, fontSize: 84, lineHeight: 1, color: colors.text}}>
              {mm}
              <span style={{fontSize: 30, color: colors.muted, marginLeft: 8}}>mm</span>
            </div>
          </Tile>
          <Tile label="LAST VISIT" delay={36}>
            <div style={{fontFamily: fonts.mono, fontWeight: 700, fontSize: 46, lineHeight: 1.8, color: colors.green}}>
              {clip.time}
            </div>
          </Tile>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 22}}>
          <div
            style={{
              padding: '10px 20px',
              borderRadius: 999,
              background: `rgba(255,181,71,${0.12 + 0.1 * pillPulse})`,
              border: `1.5px solid ${colors.amber}`,
              color: colors.amber,
              fontFamily: fonts.mono,
              fontSize: 20,
              letterSpacing: 2,
              whiteSpace: 'nowrap',
            }}
          >
            ● IN INTERACTION ZONE · TIMING
          </div>
          <Waveform width={380} height={70} seed="dogs" speed={4} busy={0.7} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
