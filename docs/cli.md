# The `feats` CLI

Phase 2c adds a standalone `feats` binary so you can run feature files
outside `bun:test` — handy for CI invocations, ad-hoc runs, or other
test-runner setups.

## Quick start

```bash
# default: load **/*.steps.ts, run tests/features/**/*.feature, Pretty output
feats

# explicit feature glob
feats tests/features/checkout.feature

# tag filter + multiple reporters
feats --tags '@critical and not @slow' \
      --reporter pretty \
      --reporter junit:reports/junit.xml
```

## Options

| Flag | Default | Notes |
|---|---|---|
| `<positional>` | `tests/features/**/*.feature` | One or more feature globs. |
| `--require <glob>` | `**/*.steps.ts` | Repeatable. Glob of step modules to `import()` before the run. |
| `--tags <expr>` | `FEATS_TAGS` env, else "" | Same syntax as `FEATS_TAGS`. Supports `and`, `or`, `not`, parens. |
| `--reporter <spec>` | `FEATS_REPORTERS` env, else `pretty` | Repeatable. Same syntax as a single `FEATS_REPORTERS` item: `pretty`, `junit:path.xml`, `cucumber-json:path.json`. |
| `--help`, `-h` | — | Print usage. |
| `--version`, `-v` | — | Print version. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All scenarios passed (pending and skipped are non-failure) |
| 1 | One or more failures, undefined steps, or runtime errors |
| 2 | CLI usage error (unknown flag, missing required value, no steps/features matched) |

## Programmatic use

`runCore(features, opts)` is exported from the main entry so you can
drive the same runner from scripts without spawning a subprocess:

```ts
import { loadFeatures, runCore, PrettyReporter } from "@questi0nm4rk/feats";
import "./tests/features/cart.steps.ts"; // registers Given/When/Then

const features = await loadFeatures("tests/features/**/*.feature");
const { summary, exitCode } = await runCore(features, {
  reporters: [new PrettyReporter()],
});
process.exitCode = exitCode;
```

`runCore` never throws on scenario failure — the caller inspects
`summary` / `exitCode` and decides what to do.

## How it relates to `bun:test`

`runFeatures` (the `bun:test` wrapper, unchanged from Phase 1/2a/2b)
and `runCore` share the same per-scenario engine (`runScenarioPure`).
Both honor the same reporters, hooks, tag filters, and pending
semantics. Pick one:

- **`bun test` + `runFeatures`** — you want feature scenarios to appear
  alongside other `bun:test` tests, get watch mode, IDE integration,
  per-test reporting, etc.
- **`feats` CLI + `runCore`** — you want a standalone binary, a single
  process owns the whole run, exit code from one place, no `bun:test`
  framing.
