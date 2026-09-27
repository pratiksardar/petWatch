# Pet Watch — hackathon demo video

An 81-second, 1080p30 submission video, composed in [Remotion](https://remotion.dev) from the four
real demo reels (dog at the water bowl + bench test of the live dashboard).

**Output:** `out/pet-watch-demo-final.mp4` (loudness-normalised to -16 LUFS for web)

## Storyboard

| # | Time | Scene | Footage |
| --- | --- | --- | --- |
| 1 | 0:00 | Cold open: "Pets hide illness. Their habits don't." Heartbeat + sonar rings. | — |
| 2 | 0:05 | Title: PET WATCH, live trace drawing in, stack chips. | — |
| 3 | 0:10 | Field test: dog drinks, visits count 1 → 2 → 3, live distance, "in zone" pill. | `dog-1..3.mp4` |
| 4 | 0:30 | How it works: Sense → Detect → Learn. | — |
| 5 | 0:38 | Bench test: raw stream → push-in on the distance readout → counter ticks 7 → 8, synced to the real dashboard. | `bench-a..c.mp4` |
| 6 | 0:59 | Trust: "It doesn't diagnose. It notices." Key numbers + stack. | — |
| 7 | 1:08 | Team: the humans who built it + the Chief Testing Officer. | `team.jpg` |
| 8 | 1:14 | Outro: "Notice the drift." | — |

Sound design is synthesized with ffmpeg (no licensing): an ambient pad, a heartbeat for the cold open,
and a sonar ping on every detected visit.

## Commands

```bash
npm install
npm run studio     # live preview / scrub
npm run build      # render + loudness-normalise -> out/pet-watch-demo-final.mp4
npm run typecheck
```

All timing lives in `src/theme.ts` (`SCENES`, `DOG_CLIPS`, `BENCH`); scenes are in `src/scenes/`.
`public/` holds the clips (2× lanczos upscale of the 368×496 originals, audio stripped) and the SFX.

## License

MIT, same as the parent project. Rendering uses [Remotion](https://remotion.dev), which has its own [license](https://remotion.dev/license) (free for individuals and small teams).
