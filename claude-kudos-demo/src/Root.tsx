import React from 'react';
import {AbsoluteFill, Audio, Composition, Sequence, interpolate, staticFile} from 'remotion';
import {SceneFade} from './components/ui';
import {Bench, BENCH_TICK} from './scenes/Bench';
import {Dogs, VISIT_TICKS} from './scenes/Dogs';
import {How} from './scenes/How';
import {Intro} from './scenes/Intro';
import {Outro} from './scenes/Outro';
import {Title} from './scenes/Title';
import {Trust} from './scenes/Trust';
import {Team} from './scenes/Team';
import {FPS, SCENES, TOTAL_FRAMES, sceneStarts, type SceneName} from './theme';

const SCENE_COMPONENTS: Record<SceneName, React.FC> = {
  intro: Intro,
  title: Title,
  dogs: Dogs,
  how: How,
  bench: Bench,
  trust: Trust,
  team: Team,
  outro: Outro,
};

const PINGS = [
  sceneStarts.title + 4,
  ...VISIT_TICKS.map((t) => sceneStarts.dogs + t),
  sceneStarts.bench + BENCH_TICK,
  sceneStarts.outro + 6,
];
const HEARTBEATS = [6, 36, 66, 96, 126];
const WHOOSHES = (Object.keys(SCENES) as SceneName[]).slice(1).map((k) => sceneStarts[k] - 14);

const Sfx: React.FC<{at: number; src: string; volume: number}> = ({at, src, volume}) => (
  <Sequence from={at} durationInFrames={75}>
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

export const PetWatchDemo: React.FC = () => (
  <AbsoluteFill style={{background: '#000'}}>
    {(Object.keys(SCENES) as SceneName[]).map((k) => {
      const Scene = SCENE_COMPONENTS[k];
      return (
        <Sequence key={k} from={sceneStarts[k]} durationInFrames={SCENES[k]} name={k}>
          <SceneFade duration={SCENES[k]}>
            <Scene />
          </SceneFade>
        </Sequence>
      );
    })}

    <Audio
      src={staticFile('pad.mp3')}
      volume={(f) =>
        interpolate(f, [0, 60, TOTAL_FRAMES - 75, TOTAL_FRAMES], [0, 0.55, 0.55, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
    {HEARTBEATS.map((at, i) => (
      <Sfx key={`h${at}`} at={at} src="heart.wav" volume={0.9 - i * 0.12} />
    ))}
    {PINGS.map((at) => (
      <Sfx key={`p${at}`} at={at} src="ping.wav" volume={0.45} />
    ))}
    {WHOOSHES.map((at) => (
      <Sfx key={`w${at}`} at={at} src="whoosh.wav" volume={0.18} />
    ))}
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <Composition
    id="PetWatchDemo"
    component={PetWatchDemo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
