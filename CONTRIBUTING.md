# Contributing to Pet Watch

Thanks for helping pets get noticed sooner.

## Ground rules

- **Node 24, zero runtime dependencies.** Reach for `node:` built-ins before a package.
- **Detection logic stays pure.** `src/detector.ts` and friends take samples in and
  return visits out, with no clocks, network, or hardware, so they stay testable.
- **Never diagnose.** Alerts describe deviation from a pet's own baseline, not health.
- **Don't commit secrets or household data.** `firmware/secrets.yaml`, `data/`, and
  `traces/*.local.json` are gitignored for a reason.

## Workflow

```bash
npm install
npm run verify        # must pass: tsc --noEmit + node --test
```

1. Open an issue first for anything bigger than a bug fix.
2. Add or update a test that fails without your change.
3. Use [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), which keeps the history Commitizen-friendly.

## Especially welcome

- Real labelled traces (`traces/*.json` + expected visit lists), anonymised.
- Support for more ultrasonic or ToF sensors in `firmware/`.
- Multi-pet attribution (BLE collar beacons).

## Demo video

The video lives in `claude-kudos-demo/` as a Remotion project. `npm run studio` there
previews it; `npm run build` re-renders `out/pet-watch-demo-final.mp4`.
