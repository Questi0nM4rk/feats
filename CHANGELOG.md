# Changelog

All notable changes to `@questi0nm4rk/feats` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [`SEMVER.md`](./SEMVER.md) for the project's stability policy.

## [Unreleased]

## [1.4.0] — 2026-05-29

Phase 2c of the roadmap. Adds a standalone `feats` CLI binary and the
`runCore` bun:test-free runner that powers it. Non-breaking — purely
additive.

### Added
- **`feats` CLI binary** — standalone runner so feature files can be
  executed outside `bun:test`. Supports `--require <glob>` to load step
  modules, `--tags <expr>` for tag filtering, `--reporter <spec>`
  (repeatable) for reporter selection, `--help`, `--version`. Defaults
  to `tests/features/**/*.feature` + `**/*.steps.ts` + Pretty reporter
  so the bare `feats` command works in most projects.
  Exit codes: 0 (passed), 1 (failed / undefined / runtime error),
  2 (CLI usage error).
- **`runCore(features, opts)`** — bun:test-free runner exported from the
  main entry. Returns `{ summary, exitCode }`, never throws on
  scenario failure. Lets scripts and custom drivers reuse the same
  engine as the CLI without spawning a subprocess
  (`src/runner/core-runner.ts`).
- **`runFeatsCli(argv, cwd?)`** — exported for tests / custom CLI wrappers.
- **`docs/cli.md`** — usage, options, exit codes, programmatic API,
  and how the CLI relates to the `bun:test` integration.

### Changed
- `runFeatures` (the bun:test wrapper) and the new `runCore` now share
  a single `runScenarioPure` per-scenario engine (`src/runner/feature-runner.ts`).
  Behavior is unchanged; the refactor keeps both paths in lockstep so
  reporter events, hook ordering, and pending semantics can't diverge.
- `package.json` declares `bin: { feats: "./bin/feats" }` and includes
  `bin/` in `files` so `npm install -g @questi0nm4rk/feats` (or a local
  `bun add`) makes the binary available.

## [1.3.0] — 2026-05-25

Phase 2b of the roadmap. Three small additive features: `Rule:` keyword
in the parser, `BeforeAll` / `AfterAll` lifecycle hooks, and pending
step support. Non-breaking.

### Added
- **`Rule:` keyword in the Gherkin parser** (`src/parser/adapter.ts`).
  Scenarios under a `Rule:` block appear flat in `feature.scenarios`
  (preserves the Phase 1/2a shape) and carry a `rule?: RuleInfo`
  field with the rule's name + tags. The runner composes
  `feature.tags ◁ rule.tags ◁ scenario.tags` for tag filtering so a
  `@critical` tag on a Rule applies to all its scenarios.
- **`BeforeAll(cb)` / `AfterAll(cb)` lifecycle hooks** (`src/runner/hook-runner.ts`).
  Fire once per `runFeatures()` call: `BeforeAll` before the first
  scenario, `AfterAll` after the last. They run even when no reporters
  are attached. Errors thrown by `AfterAll` hooks are collected (not
  allowed to mask earlier failures), matching the `After` hook pattern.
- **`pending(reason?: string)`** (`src/runner/pending.ts`). A step that
  calls `pending()` records status `"pending"` and renders subsequent
  steps as `"skipped"`. The scenario does NOT fail at the `bun:test`
  level (suite stays green); reporters see `status: "pending"` and the
  `RunSummary.pending` counter increments. Matches cucumber-js's
  non-strict default. `PendingError` and `isPendingError` are also
  exported for advanced uses.

### Changed
- `Scenario` model now has an optional `rule?: RuleInfo` field. Reading
  code that ignores the field is unaffected.
- `runFeatures` gating extended: lifecycle hooks fire even without
  reporters (previously the `firstFeature.beforeAll` / `lastFeature.afterAll`
  blocks were only registered when reporters were present).

## [1.2.0] — 2026-05-24

Phase 2a of the roadmap. Adds a reporter contract + three built-in reporters
(Pretty, JUnit, Cucumber JSON). Non-breaking — purely additive: when no
reporters are configured, the runner emits no reporter events and `bun:test`
remains the only output surface, exactly as in 1.1.0.

### Added
- **`FeatsReporter` contract** with eight optional callbacks (`onRunStart`,
  `onFeatureStart`, `onScenarioStart`, `onStep`, `onScenarioEnd`,
  `onFeatureEnd`, `onRunEnd`). All callbacks may be sync or async; the
  runner awaits each in registration order. Reporters see the **raw** step
  and error — not the `formatStepError`-wrapped `Error` `bun:test` uses
  for its own rendering (`src/reporting/reporter.ts`).
- **Three built-in reporters** (`src/reporting/reporters/`):
  - `PrettyReporter` — human-readable console output with status icons,
    durations, and a `Failures:` section. Honors `NO_COLOR` and TTY detection.
  - `JUnitReporter` — Jenkins/Surefire-shaped XML written on `onRunEnd`.
  - `CucumberJsonReporter` — cucumber-js-shaped JSON (the format
    `cucumber-html-reporter` and similar consumers expect; durations in ns).
- **`FEATS_REPORTERS` env var** — comma-separated reporter spec
  (`pretty,junit:out.xml,cucumber-json:out.json`) so CI can attach reporters
  without code changes. `opts.reporters` always wins when explicitly set
  (`src/reporting/from-env.ts`).
- **Path-collision fail-fast** in `JUnitReporter` and `CucumberJsonReporter`:
  constructing two instances with the same `outFile` in one process throws.
  Use the `{n}` placeholder for a 1-based instance counter when this is
  intentional.
- **Per-step status capture in the runner.** `feature-runner.ts` now
  records per-step `passed` / `failed` / `skipped` / `undefined` status
  and timing, aggregates them into `ScenarioResult` / `FeatureResult` /
  `RunSummary`, and emits the event stream. Throw behavior to `bun:test`
  is unchanged.
- **Docs**: `docs/reporters.md` covers the contract, the three built-ins,
  the env var, and how to write a custom reporter.

### Changed
- `runFeatures` accepts a new `reporters` option in `RunOptions`. When
  omitted, the runner reads `FEATS_REPORTERS` from the environment; when
  that's empty, no reporter machinery runs.

## [1.1.0] — 2026-05-23

Phase 1 of the roadmap. Wires the existing dead code in `src/reporting/` into
the runner and adds small DX features. Non-breaking — purely additive.

### Added
- **Step failures now include Gherkin context.** When a step throws, the
  runner wraps the error via `formatStepError` so `bun:test`'s default
  rendering shows `uri:line`, the keyword + step text, and the original
  error message. Original error remains reachable via `error.cause`
  (`src/runner/feature-runner.ts`).
- **Undefined-step errors carry `uri:line` + a working code snippet.** The
  snippet substitutes inline literals — `"Widget"` becomes `{string}`, `3`
  becomes `{int}`, `9.99` becomes `{float}` — and lists generic numbered
  args (`arg1`, `arg2`, ...) so the pasted snippet matches the step
  immediately (`src/registry/expression-adapter.ts`, `src/reporting/pending-steps.ts`).
- **Ambiguous-step errors also include `uri:line`** plus the conflicting
  patterns (`src/registry/expression-adapter.ts`).
- **`FEATS_TAGS` env var** as the default tag filter when `opts.tagFilter`
  is unset. Lets CI filter scenarios without code changes
  (`src/runner/feature-runner.ts`).
- **Parentheses in tag-filter expressions.** `(@a or @b) and not @c`,
  `not (@a and @b)`, nested groups. Trailing tokens are now rejected as
  malformed (previously silently ignored) (`src/runner/tag-filter.ts`).
- **`isDataTable` / `isDocString` type guards** for narrowing the trailing
  `unknown` args step callbacks receive (`src/parser/models.ts`).
- **`resetFeats()` + `clearRegistry`, `clearHooks`, `clearParameterTypeRegistry`
  exports** for test-isolation between files (`src/state/reset.ts` + re-exports).

### Changed
- `matchStep(definitions, step)` now takes a `ParsedStep` instead of a bare
  `string`. The callers in `feature-runner.ts` were updated. Downstream users
  who imported `matchStep` directly (internal API; not previously documented)
  need to pass a `ParsedStep`.

### Docs
- `docs/parameter-types.md` — defining custom Gherkin parameter types.
- `docs/world.md` — typed worlds, factories, sharing setup across steps.
- `docs/test-isolation.md` — `resetFeats` patterns and gotchas.
- README — new "Filtering by tag" + "Better failure messages" sections,
  expanded exports table, links to all the new docs.

## [1.0.2] — 2026-05-23

### Fixed
- After hooks no longer silently swallow their own errors. If both a step and
  one or more After hooks throw, all are reported via `AggregateError`
  (`src/runner/feature-runner.ts`).
- `Scenario Outline` whose name has no `<placeholder>` no longer produces
  duplicate `test()` names; colliding examples get a `[N]` suffix
  (`src/parser/adapter.ts`).
- `Scenario Outline` examples no longer double-execute Background steps. The
  parser used to leave Cucumber's pickle-merged Background steps inside each
  outline scenario's `.steps`, while the runner also ran Background separately
  — so for outlines, Background ran twice. Now stripped from outline pickles
  (`src/parser/adapter.ts`). Plain scenarios were unaffected and remain so.
- YAML config-assertion parsing is bounded by `maxAliasCount: 100` to prevent
  "billion laughs"-style anchor expansion attacks
  (`src/assertions/config-assertions.ts`).

### Removed
- Dead, unexported duplicate `src/runner/scenario-runner.ts` (its logic lived
  inline in `feature-runner.ts`; deleted along with its standalone test file).

### Internal
- Added black-box contract suite `tests/runner/run-features.contract.test.ts`
  pinning the externally-observable behavior of `runFeatures()` (background
  ordering, hook order, world-factory invocation, etc.) as a safety net for
  Phase 2's planned `core-runner` extraction.
- Added perf bench harness `bench/synthetic.ts` + `bench/run.ts` with a
  100-scenario synthetic parser workload. Baseline for 1.0.2 captured in
  `bench/baseline-1.0.2.json`.
- Added standalone tag-filter parser tests (`tests/runner/tag-filter.test.ts`)
  covering precedence, double negation, and malformed expressions.
- Added Bun plugin integration tests (`tests/plugin/bun-plugin.test.ts`).
- Added `scripts/e2e-hook-kit.sh` harness that links the local build into a
  sibling `hook-kit` checkout and runs its feature tests.
- Added inline documentation for the positional `ParameterType` constructor
  arguments in `src/registry/parameter-types.ts`.

## [1.0.1] — earlier
- Removed the `bun` export condition that left raw source with unresolved
  `@/*` aliases; consumers now always receive built output.

## [1.0.0] — initial release
- BDD/Gherkin test framework for Bun.
- Cucumber expressions, scenario outlines, backgrounds, tags.
- Fixtures, RNG, CLI runner, config-assertions helpers.
- Bun plugin for importing `.feature` files as JS modules.

[Unreleased]: https://github.com/Questi0nM4rk/feats/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Questi0nM4rk/feats/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/Questi0nM4rk/feats/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Questi0nM4rk/feats/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Questi0nM4rk/feats/releases/tag/v1.0.0
