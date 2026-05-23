# Stability policy

`@questi0nm4rk/feats` follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## What's covered

The **public API** is everything reachable from the top-level entry point
`@questi0nm4rk/feats` and the subpath export `@questi0nm4rk/feats/plugin`.
That includes:

- All named exports listed under `export { … }` in `src/feats.ts`
- The default-export of `src/plugin/bun-plugin.ts`
- The observable runtime behavior of `runFeatures()` (described by the
  contract tests in `tests/runner/run-features.contract.test.ts`)

Anything reachable only via deep import (e.g. `@questi0nm4rk/feats/src/...`)
is **not** part of the public API and may change without notice.

## Rules

- **MAJOR** (`X.0.0`): removed export, renamed export, changed function
  signature, or any contract test in `run-features.contract.test.ts` had to
  be changed to make the suite pass.
- **MINOR** (`1.X.0`): new export, new option on an existing function, new
  CLI flag, new keyword support (e.g. `Rule:`), new lifecycle hook.
- **PATCH** (`1.0.X`): bug fix that makes the observable behavior match what
  documentation/tests already promised. No new exports.

## Examples

| Change | Bump |
|---|---|
| Wire `formatStepError` into the runner so failures include `uri:line` | minor (changes failure-message shape, which is observable) |
| Fix After-hook silent error swallow (this release) | patch (existing tests asserted "hook errors should surface"; they didn't — now they do) |
| Add `BeforeAll` / `AfterAll` | minor |
| Remove `assertConfig` | major |
| Change `runFeatures(...)` to require a `reporters` array | major |
| Add optional `reporters?: …` option to `runFeatures` | minor |
| Add a new built-in parameter type | minor |

## Pre-release versions

We may publish `1.x.0-rc.N` for hook-kit / ai-guardrails E2E validation
before tagging the final `1.x.0`. RC tags are stable for the duration of
their RC cycle; we do not retroactively change a published RC.
