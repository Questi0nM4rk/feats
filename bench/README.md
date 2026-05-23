# `bench/` — Performance baseline harness

Synthetic perf bench for the parser + runner code paths. Used as a regression
gate by Phases 1 and 2.

## Run

```bash
bun run bench
```

Tunable via env:
- `FEATS_BENCH_ITERATIONS` (default `30`)
- `FEATS_BENCH_SCENARIOS` (default `100`)

Writes `bench/last-run.json` with `medianMs` and `p95Ms`.

## Baselines

Per release, a baseline is committed as `bench/baseline-<version>.json` (e.g.
`baseline-1.0.2.json`). This is informational only — absolute timings are not
comparable across machines.

## What CI compares

The `bench` workflow re-runs this on PR and on `main` on the same runner,
and fails the PR check if PR median exceeds `main` median by more than 10%.

## Caveats

- This bench measures **parser cost** only. Runner timing is dominated by
  `bun:test` overhead which is unmeasurable here (the runner registers
  describes/tests but does not execute them in this harness).
- Phase 2 will extend this to a runner bench once `core-runner` exists and
  can be invoked outside of `bun:test`.
