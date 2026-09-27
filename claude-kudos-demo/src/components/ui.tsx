import React from 'react';
import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {colors, fonts} from '../theme';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const useSpring = (delay = 0, damping = 18) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - delay, fps, config: {damping, mass: 0.8}});
};

/** Dark lab backdrop: drifting grid, green bloom, vignette. */
export const Background: React.FC<{glow?: [number, number]}> = ({glow = [30, 40]}) => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.4) % 80;
  return (
    <AbsoluteFill style={{background: colors.bg}}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${colors.line} 1px, transparent 1px), linear-gradient(90deg, ${colors.line} 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          backgroundPosition: `${drift}px ${drift}px`,
          opacity: 0.35,
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${glow[0]}% ${glow[1]}%, rgba(52,245,164,0.16), transparent 45%), radial-gradient(circle at 85% 90%, rgba(255,181,71,0.08), transparent 40%)`,
        }}
      />
      <AbsoluteFill style={{boxShadow: 'inset 0 0 260px rgba(0,0,0,0.9)'}} />
    </AbsoluteFill>
  );
};

/** Fades a scene in and out so hard cuts never happen. */
export const SceneFade: React.FC<{duration: number; children: React.ReactNode; edge?: number}> = ({
  duration,
  children,
  edge = 12,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, edge, duration - edge, duration], [0, 1, 1, 0], clamp);
  const blur = interpolate(frame, [0, edge, duration - edge, duration], [8, 0, 0, 8], clamp);
  return <AbsoluteFill style={{opacity, filter: `blur(${blur}px)`}}>{children}</AbsoluteFill>;
};

export const Eyebrow: React.FC<{children: React.ReactNode; delay?: number; color?: string}> = ({
  children,
  delay = 0,
  color = colors.green,
}) => {
  const s = useSpring(delay);
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        fontSize: 22,
        letterSpacing: 6,
        textTransform: 'uppercase',
        color,
        opacity: s,
        transform: `translateY(${(1 - s) * 16}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <span style={{width: 10, height: 10, borderRadius: 5, background: color, boxShadow: `0 0 16px ${color}`}} />
      {children}
    </div>
  );
};

/** Word-by-word rise with a blur pull-focus. Words wrapped in *asterisks* get the accent colour. */
export const Headline: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  stagger?: number;
  align?: 'left' | 'center';
}> = ({text, delay = 0, size = 76, stagger = 3, align = 'left'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div
      style={{
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: -size * 0.03,
        color: colors.text,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        columnGap: size * 0.26,
      }}
    >
      {text.split(' ').map((raw, i) => {
        const accent = raw.startsWith('*');
        const word = raw.replace(/\*/g, '');
        const s = spring({frame: frame - delay - i * stagger, fps, config: {damping: 16, mass: 0.7}});
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: s,
              transform: `translateY(${(1 - s) * size * 0.5}px)`,
              filter: `blur(${(1 - s) * 10}px)`,
              color: accent ? colors.green : undefined,
              textShadow: accent ? `0 0 40px ${colors.greenDim}` : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

export const Body: React.FC<{children: React.ReactNode; delay?: number; size?: number; width?: number}> = ({
  children,
  delay = 0,
  size = 30,
  width = 760,
}) => {
  const s = useSpring(delay, 22);
  return (
    <div
      style={{
        fontFamily: fonts.body,
        fontSize: size,
        lineHeight: 1.45,
        color: colors.muted,
        maxWidth: width,
        opacity: s,
        transform: `translateY(${(1 - s) * 20}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Phone-style rounded frame around real footage, with optional slow push-in toward a point of interest. */
export const VideoCard: React.FC<{
  src: string;
  startFrom?: number;
  width: number;
  zoom?: {from: number; to: number; x: number; y: number; start?: number; end: number};
  label?: string;
}> = ({src, startFrom = 0, width, zoom, label = 'LIVE'}) => {
  const frame = useCurrentFrame();
  const height = Math.round((width * 992) / 736);
  const scale = zoom
    ? interpolate(frame, [zoom.start ?? 0, zoom.end], [zoom.from, zoom.to], {
        ...clamp,
        easing: Easing.inOut(Easing.cubic),
      })
    : 1;
  const blink = Math.floor(frame / 15) % 2 === 0 ? 1 : 0.35;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 36,
        overflow: 'hidden',
        position: 'relative',
        border: `1.5px solid rgba(52,245,164,0.35)`,
        boxShadow: '0 40px 120px rgba(0,0,0,0.7), 0 0 80px rgba(52,245,164,0.14)',
        background: '#000',
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        startFrom={startFrom}
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
          transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : 'center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 22,
          left: 22,
          padding: '8px 16px',
          borderRadius: 999,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          fontFamily: fonts.mono,
          fontSize: 18,
          letterSpacing: 3,
          color: colors.text,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <span style={{width: 10, height: 10, borderRadius: 5, background: '#ff4d4d', opacity: blink}} />
        {label}
      </div>
      <AbsoluteFill style={{boxShadow: 'inset 0 0 60px rgba(0,0,0,0.55)', pointerEvents: 'none'}} />
    </div>
  );
};

/** Scrolling distance trace, styled like the dashboard's "last 2 minutes" chart. */
export const Waveform: React.FC<{
  width: number;
  height: number;
  seed?: string;
  speed?: number;
  draw?: number;
  opacity?: number;
  busy?: number;
}> = ({width, height, seed = 'w', speed = 3, draw = 1, opacity = 1, busy = 0.5}) => {
  const frame = useCurrentFrame();
  const step = 6;
  const n = Math.ceil(width / step) + 2;
  const offset = frame * speed;
  const first = Math.floor(offset / step);
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const k = first + i;
    // Bursts of activity (visits) on a quiet baseline, as on the real trace.
    const burst = random(`${seed}-b-${Math.floor(k / 40)}`) < busy;
    const r = random(`${seed}-${k}`);
    const v = burst ? 0.25 + r * 0.7 : 0.08 + r * 0.06 + (random(`${seed}-s-${k}`) > 0.97 ? 0.5 : 0);
    pts.push(`${i * step - (offset % step)},${height - v * height}`);
  }
  const len = width * 3;
  return (
    <svg width={width} height={height} style={{overflow: 'visible', opacity}}>
      <defs>
        <linearGradient id={`fade-${seed}`} x1="0" x2="1">
          <stop offset="0" stopColor={colors.green} stopOpacity="0" />
          <stop offset="0.15" stopColor={colors.green} stopOpacity="1" />
          <stop offset="1" stopColor={colors.green} stopOpacity="1" />
        </linearGradient>
      </defs>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={`url(#fade-${seed})`}
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - draw)}
        style={{filter: `drop-shadow(0 0 6px ${colors.greenDim})`}}
      />
    </svg>
  );
};

/** Expanding sonar rings — the product's one sense. */
export const SonarRings: React.FC<{size: number; period?: number; count?: number; opacity?: number}> = ({
  size,
  period = 60,
  count = 3,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{position: 'relative', width: size, height: size, opacity}}>
      {Array.from({length: count}).map((_, i) => {
        const t = ((frame + (i * period) / count) % period) / period;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `2px solid ${colors.green}`,
              transform: `scale(${0.1 + t * 0.9})`,
              opacity: (1 - t) * 0.8,
              boxShadow: `0 0 30px ${colors.greenDim}`,
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -7,
          borderRadius: 7,
          background: colors.green,
          boxShadow: `0 0 30px ${colors.green}`,
        }}
      />
    </div>
  );
};

/** Odometer-style number: the old value slides up and out as the new one arrives. */
export const RollingNumber: React.FC<{value: number; changedAt: number; size: number; color?: string}> = ({
  value,
  changedAt,
  size,
  color = colors.text,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - changedAt, fps, config: {damping: 14}});
  const flash = interpolate(frame - changedAt, [0, 4, 30], [0, 1, 0], clamp);
  const style: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    fontFamily: fonts.display,
    fontWeight: 700,
    fontSize: size,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  };
  return (
    <div style={{position: 'relative', height: size, width: size * 0.7 * String(value).length, overflow: 'hidden'}}>
      <div style={{...style, color, transform: `translateY(${-s * size}px)`, opacity: 1 - s}}>{value - 1}</div>
      <div
        style={{
          ...style,
          color: flash > 0.05 ? colors.green : color,
          transform: `translateY(${(1 - s) * size}px)`,
          textShadow: `0 0 ${40 * flash}px ${colors.green}`,
        }}
      >
        {value}
      </div>
    </div>
  );
};

export const Chip: React.FC<{children: React.ReactNode; delay?: number; color?: string}> = ({
  children,
  delay = 0,
  color = colors.green,
}) => {
  const s = useSpring(delay, 14);
  return (
    <div
      style={{
        padding: '12px 22px',
        borderRadius: 999,
        border: `1.5px solid ${color}55`,
        background: `${color}12`,
        color,
        fontFamily: fonts.mono,
        fontSize: 22,
        letterSpacing: 1,
        opacity: s,
        transform: `scale(${0.8 + s * 0.2})`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
};
