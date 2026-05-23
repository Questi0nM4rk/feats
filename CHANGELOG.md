# Changelog

All notable changes to `@questi0nm4rk/feats` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [`SEMVER.md`](./SEMVER.md) for the project's stability policy.

## [Unreleased]

## [1.0.2] — 2026-05-23

### Fixed
- After hooks no longer silently swallow their own errors. If both a step and
  one or more After hooks throw, all are reported via `AggregateError`
  (`src/runner/feature-runner.ts`).
- `Scenario Outline` whose name has no `<placeholder>` no longer produces
  duplicate `test()` names; colliding examples get a `[N]` suffix
  (`src/parser/adapter.ts`).
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

[Unreleased]: https://github.com/Questi0nM4rk/feats/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/Questi0nM4rk/feats/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Questi0nM4rk/feats/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Questi0nM4rk/feats/releases/tag/v1.0.0
