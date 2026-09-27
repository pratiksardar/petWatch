import {loadFont as loadDisplay} from '@remotion/google-fonts/SpaceGrotesk';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {loadFont as loadBody} from '@remotion/google-fonts/Inter';

export const fonts = {
  display: loadDisplay('normal', {weights: ['500', '700'], subsets: ['latin']}).fontFamily,
  mono: loadMono('normal', {weights: ['400', '700'], subsets: ['latin']}).fontFamily,
  body: loadBody('normal', {weights: ['400', '500', '600'], subsets: ['latin']}).fontFamily,
};

// Palette lifted from the live dashboard: phosphor green trace, amber "in zone" pill.
export const colors = {
  bg: '#04080a',
  panel: 'rgba(14, 24, 24, 0.72)',
  line: 'rgba(52, 245, 164, 0.18)',
  green: '#34f5a4',
  greenDim: 'rgba(52, 245, 164, 0.55)',
  amber: '#ffb547',
  text: '#eaf4f0',
  muted: '#86a09a',
};

export const FPS = 30;

// Scene lengths in frames. Dog clip lengths match the source footage exactly.
export const DOG_CLIPS = [
  {src: 'dog-1.mp4', frames: 222, visits: 1, time: '14:28:40', mm: [712, 163, 717, 779, 205]},
  {src: 'dog-2.mp4', frames: 137, visits: 2, time: '14:30:26', mm: [169, 189, 304, 46, 36]},
  {src: 'dog-3.mp4', frames: 246, visits: 3, time: '14:30:43', mm: [690, 240, 172, 410, 188]},
] as const;

export const BENCH = [
  {src: 'bench-a.mp4', startFrom: 30, frames: 210},
  {src: 'bench-b.mp4', startFrom: 60, frames: 210},
  // Counter on the real dashboard ticks 7 -> 8 at ~6.9 s into bench-c.
  {src: 'bench-c.mp4', startFrom: 90, frames: 219, tickAt: 117},
] as const;

const sum = (xs: readonly {frames: number}[]) => xs.reduce((a, x) => a + x.frames, 0);

export const SCENES = {
  intro: 150,
  title: 150,
  dogs: sum(DOG_CLIPS),
  how: 240,
  bench: sum(BENCH),
  trust: 270,
  team: 180,
  outro: 210,
} as const;

export type SceneName = keyof typeof SCENES;

export const sceneStarts = (() => {
  let t = 0;
  const out = {} as Record<SceneName, number>;
  for (const k of Object.keys(SCENES) as SceneName[]) {
    out[k] = t;
    t += SCENES[k];
  }
  return out;
})();

export const TOTAL_FRAMES = Object.values(SCENES).reduce((a, b) => a + b, 0);
