# Phase 2 — Reporters, Lifecycle, CLI (the "Enterprise Feel")

**Target version:** `1.2.0` (minor). Non-breaking. Adds the features that make
a Gherkin runner usable for stakeholder-facing CI work.

**Goal:** Ship the pieces that make `feats` a credible drop-in for someone
migrating off SpecFlow: pretty console output, JUnit XML for CI, Cucumber JSON
for downstream tooling, `Rule:` keyword, lifecycle hooks beyond per-scenario,
and a real CLI.

**Phase 0/1 dependencies:**
- **Phase 0 §0.14** — black-box `runFeatures` regression suite. Phase 2
  extracts a `core-runner` (§2.9) that the CLI drives independently of
  `bun:test`. Without §0.14 the refactor is unsafe.
- **Phase 0 §0.13** — `bench/` harness. Phase 2's perf budget is "≤10% over
  Phase 1 baseline" — this requires committed baseline files from both phases.
- **Phase 1 design contract** — reporters receive the raw `step` and raw
  `error`, NOT the `formatStepError`-wrapped one. The wrap is `bun:test`'s
  default rendering fallback only. Phase 2 reporters render their own way
  using `result.error` (= the `cause` of the wrap if it bubbled up, or the
  raw error if intercepted before bun:test sees it).
- **Phase 0 §0.1** — After-hook accumulation. Reporter failure events depend on
  knowing whether the step failed, a hook failed, or both.

---

## In scope

- Reporter interface (multiple reporters can run simultaneously)
- Pretty console reporter
- JUnit XML reporter
- Cucumber JSON reporter (compatible with cucumber-html-reporter)
- `Rule:` keyword support
- `BeforeAll` / `AfterAll` hooks
- `BeforeStep` / `AfterStep` hooks
- `pending()` helper + pending result type
- `feats` CLI binary (`bunx feats <glob> [--tags] [--reporter] [--require]`)

## Out of scope

- Living-documentation HTML server (use Cucumber JSON + existing tools)
- Multiple reporter plugin protocol (just compose what we ship)
- Localization
- Parallelism within a feature
- Step-result caching, retry, flake detection
- IDE / language-server work

---

## Architecture sketch

### Reporter contract

```ts
// src/reporting/reporter.ts (new)
export type StepStatus = "passed" | "failed" | "pending" | "skipped" | "undefined";
export interface StepResult {
  step: ParsedStep;
  status: StepStatus;
  durationMs: number;
  error?: unknown;
}
export interface ScenarioResult {
  scenario: Scenario;
  feature: Feature;
  status: StepStatus; // worst-of
  steps: StepResult[];
  durationMs: number;
}
export interface RunSummary {
  features: number;
  scenarios: number;
  passed: number;
  failed: number;
  pending: number;
  skipped: number;
  durationMs: number;
}
export interface FeatsReporter {
  onRunStart?(features: readonly Feature[]): void;
  onScenarioStart?(scenario: Scenario, feature: Feature): void;
  onStep?(result: StepResult): void;
  onScenarioEnd?(result: ScenarioResult): void;
  onRunEnd?(summary: RunSummary): Promise<void> | void;
}
```

The runner emits events; reporters consume them. The bun:test integration stays
(scenarios are still `test()` blocks), but reporters get a parallel data stream.

### Runner change

```ts
// feature-runner.ts — runFeatures receives reporters
export interface RunOptions {
  worldFactory?: WorldFactory;
  tagFilter?: string;
  reporters?: readonly FeatsReporter[];
}
```

Each step is timed. Result is emitted as `onStep`. Scenario aggregate emitted as
`onScenarioEnd`. `onRunEnd` fires inside an `afterAll(...)` registered in the
outermost describe.

### "Run" semantics — the bun:test ↔ CLI tension

A "run" means different things under each mode:

| Mode | One run = | `onRunStart` fires | `onRunEnd` fires |
|------|-----------|-------------------|------------------|
| `bun test` (one `.test.ts` calls `runFeatures()`) | one `runFeatures()` call | top of describe | bun:test's `afterAll` of that describe |
| `bun test` (N `.test.ts` files each call `runFeatures()`) | each `runFeatures()` call is its OWN run | N times | N times |
| CLI (`bunx feats <glob>`) | the whole suite | once | once |

**The problem:** file-output reporters (JUnit XML, Cucumber JSON) need to
write *one* file per "run". Under `bun test` with multiple `.test.ts` files,
they'd write N files (or clobber each other into one). Under the CLI, one
file. Confusing.

**Decision:**
- **CLI is the supported path for file-output reporters.** Recommended in
  docs as the way to get clean JUnit XML / Cucumber JSON for CI.
- **`bun test` mode** still works for the pretty reporter (which writes to
  stdout and is naturally per-file). File reporters under `bun test` get a
  warning at construction: "writes one file per runFeatures() call; use the
  CLI for unified output."
- File reporters take a `filename` *pattern* with `{n}` placeholder
  (e.g., `junit-{n}.xml`) for the `bun test` multi-file case. If `{n}` is
  absent and the same path is requested twice, throw on construction of the
  second instance (fail-fast).

Document this prominently in `docs/reporters.md`.

---

## Task list

### 2.1 Reporter contract + integration

- [ ] Create `src/reporting/reporter.ts` with types above
- [ ] Re-export from `feats.ts`
- [ ] Update `src/runner/feature-runner.ts`:
  - Time each step
  - Emit `onScenarioStart`, `onStep`, `onScenarioEnd`
  - Use `bun:test`'s `beforeAll`/`afterAll` to dispatch `onRunStart`/`onRunEnd`
- [ ] Compose multiple reporters: simple `for (const r of reporters)` loop
- [ ] Tests: a test reporter that records all events; assert ordering + payload

### 2.2 Pretty console reporter

`src/reporting/reporters/pretty.ts`

Output format (sample, colors omitted):

```text
Feature: Shopping cart checkout

  Scenario: Add item and checkout
    ✓ Given the cart is empty                     (2 ms)
    ✓ When I add "Widget" to the cart             (1 ms)
    ✓ Then the cart should have 1 item            (3 ms)
    ✓ And the total should be 9.99                (1 ms)

1 feature, 1 scenario (1 passed), 4 steps (4 passed) — 7 ms
```

Failure example:

```text
Feature: Shopping cart checkout

  Scenario: Add expired coupon
    ✓ Given the cart is empty                     (1 ms)
    ✗ When I apply coupon "EXPIRED"               (4 ms)
        tests/features/checkout.feature:8
        When I apply coupon "EXPIRED"

        Error: Expected status 422 but got 200
    − Then I should see "coupon expired"          (skipped)
```

- [ ] Implemented
- [ ] Colors via `Bun.color` or simple ANSI; disabled when `!process.stdout.isTTY`
      or `NO_COLOR` set
- [ ] Tests with golden snapshot
- [ ] Performance check: a 100-scenario run with pretty reporter is within 5%
      of no-reporter baseline

### 2.3 JUnit XML reporter

`src/reporting/reporters/junit.ts`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="feats" tests="N" failures="N" time="N">
  <testsuite name="Feature name" tests="N" failures="N" time="N">
    <testcase name="Scenario name" classname="Feature name" time="N">
      <failure message="...">...stack...</failure>
    </testcase>
  </testsuite>
</testsuites>
```

- [ ] Implemented as a class with constructor `{ outFile: string }`
- [ ] Writes file in `onRunEnd`
- [ ] XML-escapes special characters
- [ ] Tests: parse output XML and assert structure
- [ ] Smoke-tested: open output in IntelliJ / GitLab CI / Jenkins parser

### 2.4 Cucumber JSON reporter

`src/reporting/reporters/cucumber-json.ts`

Cucumber JSON spec: an array of feature objects with nested scenarios and
steps. Match the shape that `cucumber-html-reporter` expects.

- [ ] Implemented as a class with `{ outFile: string }`
- [ ] Schema validated against a sample known-good cucumber JSON
- [ ] Smoke test: feed output to `cucumber-html-reporter` (dev-dep), confirm
      it produces an HTML file without errors

### 2.5 `Rule:` keyword support

**Why:** Standard Gherkin 6+. Today, `parser/adapter.ts:155-176` iterates
`feature.children` and only branches on `child.background` and `child.scenario`.
A `Rule:` block becomes invisible — its scenarios are silently dropped.

**Parser change:**

```ts
// adapter.ts — extend the loop
for (const child of feature.children) {
  if (child.background !== undefined) { /* unchanged */ }
  if (child.scenario !== undefined) { /* unchanged */ }
  if (child.rule !== undefined) {
    for (const ruleChild of child.rule.children) {
      // each rule child has its own background or scenario
      // scenarios under a rule inherit rule tags
    }
  }
}
```

**Model change:** Either flatten (scenarios from rules get added to
`feature.scenarios` with their rule's tags merged in) or nest. **Flatten** is
simpler and changes nothing for existing consumers.

- [ ] Parser: handle `child.rule` (with its own background + scenarios)
- [ ] Rule tags merge into scenario tags
- [ ] Rule-level background prepended to scenario steps (or combined with
      feature background — define semantics)
- [ ] Tests: feature with mixed scenarios + rules, rule with background, rule
      tag inheritance
- [ ] hook-kit E2E: temporarily add a `Rule:` block, confirm scenarios run

### 2.6 `BeforeAll` / `AfterAll`

**Semantics:** runs once per feature (mapped to bun:test's `beforeAll`/`afterAll`
inside the `describe`). Same tag-filter support as `Before`/`After`.

```ts
// hook-runner.ts — add
export function BeforeAll(callback: () => Promise<void> | void): void;
export function BeforeAll(tagFilter: string, callback: () => Promise<void> | void): void;
```

Note: these do **not** receive a `world` argument (no per-scenario world at this
scope). If a user needs shared state, they share it via module scope.

**Tag-filter semantics (decision):** A tag-filtered `BeforeAll` / `AfterAll`
runs when **at least one scenario in the feature would be selected by that
filter**. Computing this requires a single pre-pass over `feature.scenarios`
before entering `describe`. Cost is O(scenarios × tag-eval); negligible since
both are small.

Alternatives considered:
- *Always run, ignore tag filter on BeforeAll/AfterAll* (cucumber-js
  approach) — rejected: surprises users who write `BeforeAll("@db", ...)`
  expecting it to mean "only when @db scenarios are present".
- *Re-evaluate per scenario* — wrong semantics; would fire once per matching
  scenario, defeating the "once per feature" contract.

- [ ] Implemented in `hook-runner.ts`
- [ ] Wired into `feature-runner.ts` via `beforeAll`/`afterAll` inside `describe`
- [ ] Tag-filter pre-pass implemented
- [ ] Tests including: no-tag-filter case, tag-filter matches some scenarios,
      tag-filter matches no scenarios (hook does NOT run)
- [ ] README documents the world-less signature AND the tag-filter pre-pass
      semantics

### 2.7 `BeforeStep` / `AfterStep`

**Semantics:** runs around each step. Receives `world` and `step`. `AfterStep`
additionally receives the `StepResult` so reporters / failure-screenshot
handlers can react.

```ts
export function BeforeStep(callback: (world: World, step: ParsedStep) => Promise<void> | void): void;
export function AfterStep(callback: (world: World, step: ParsedStep, result: StepResult) => Promise<void> | void): void;
```

- [ ] Implemented
- [ ] AfterStep runs even if the step failed
- [ ] AfterStep errors collected and reported (same pattern as After-hook
      accumulation from Phase 0)
- [ ] Tests
- [ ] Example: a `BeforeStep` that logs each step; an `AfterStep` that
      screenshots on failure

### 2.8 `pending()` helper + status type

```ts
// src/state/pending.ts (new)
export class PendingError extends Error {
  readonly isPending = true;
  constructor(reason?: string) { super(reason ?? "Step is pending"); }
}
export function pending(reason?: string): never { throw new PendingError(reason); }
```

**Runner change:** catch `PendingError` in `runSteps`. Mark the step result as
`pending`, skip subsequent steps in the scenario, mark scenario as pending in
the result event, but **don't** fail the bun:test test — use `test.todo` or
emit a console warning. Open question: hard-fail in CI vs warn locally.

**Decision:** mark pending in reporter events. For `bun:test`, allow opt-in
via `RunOptions.failOnPending: boolean = false`. Default is non-failing (CI
will see yellow in pretty / JUnit XML output, but tests pass).

**Decision locked:** `failOnPending` defaults to `false`. This matches Cucumber
across all major implementations. CI users opt into stricter behavior.

- [ ] `PendingError` class + `pending()` helper
- [ ] Runner catches `PendingError` separately from generic Error
- [ ] Reporter `StepStatus = "pending"` flows through to pretty + JUnit + JSON
- [ ] `failOnPending: false` is the default — verified by a test
- [ ] `failOnPending: true` flips to hard fail — verified by a test
- [ ] Tests

### 2.9 `feats` CLI binary

**Why:** Both hook-kit and ai-guardrails write a `.test.ts` file per feature
glob just to call `loadFeatures(...)` + `runFeatures(...)`. A CLI removes that
boilerplate and adds reporter selection.

**Spec:**

```text
feats <glob> [<glob>...]
  --tags <expr>          Tag filter expression (overrides FEATS_TAGS)
  --reporter <spec>      Reporter spec, e.g. pretty, junit:out.xml, cucumber-json:out.json
                         Can be passed multiple times
  --require <path>       Path to a TS file to import (step defs). Defaults to
                         sibling `*.steps.ts` files of each .feature
  --fail-on-pending      Treat pending steps as failures
  --help, --version
```

**Implementation:**
- `src/cli/feats-bin.ts` (new) — entry point
- Discover step files: for each `.feature`, look for `<basename>.steps.ts`.
  Override with `--require`.
- Use Bun's dynamic `import()` to load step modules.
- Call `runFeatures` directly — **but** the current `runFeatures` registers
  `describe`/`test` against `bun:test`. The CLI is standalone, not under
  `bun test`. Two options:
  1. **Refactor**: extract `runFeaturesStandalone()` that uses reporters
     directly without bun:test.
  2. **Wrap**: have the CLI spawn `bun test` with a generated harness file.

**Recommended approach: option 1.** Extract a `core-runner` that emits reporter
events. The existing `runFeatures()` (bun:test mode) becomes a thin adapter
that wraps `core-runner` + dispatches `describe`/`test`.

**Safety net (from Phase 0 §0.14):** the black-box regression suite
`tests/runner/run-features.contract.test.ts` pins the externally-observable
behavior of `runFeatures`. The refactor is "done" when the new
`core-runner` + `runFeatures` adapter passes the entire contract suite
unchanged.

- [ ] Phase 0 §0.14 contract suite is green on `main` (baseline)
- [ ] `src/runner/core-runner.ts` extracted — pure reporter dispatch, no
      bun:test imports
- [ ] `runFeatures()` (existing) wraps `core-runner` + bun:test
- [ ] All §0.14 contract tests still pass post-refactor (zero changes to
      those tests allowed; if they need to change, the refactor changed
      observable behavior and the change must be called out and approved)
- [ ] `src/cli/feats-bin.ts` calls `core-runner` directly
- [ ] `package.json:bin` points to dist of CLI
- [ ] Help / version commands
- [ ] Tests: CLI smoke test (spawn binary, assert exit code + stdout)
- [ ] hook-kit E2E: `bunx feats tests/features/*.feature --reporter pretty`
      replaces hook-kit's `tests/features/run-pipeline.test.ts`

### 2.10 README + docs overhaul

- [ ] New "Reporters" section in README
- [ ] `docs/reporters.md` — built-in reporters + writing a custom one
- [ ] `docs/cli.md` — full CLI reference
- [ ] `docs/hooks.md` — full lifecycle: BeforeAll/Before/BeforeStep/AfterStep/After/AfterAll
- [ ] `docs/pending.md` — how to mark in-progress work
- [ ] Updated quick-start example uses CLI

---

## End-to-end test plan

### Reporter smoke (each one separately)

For each of `pretty`, `junit`, `cucumber-json`:
1. Run feats' own test suite with that reporter active
2. Verify output is structurally valid (golden files for pretty; XML parse for
   JUnit; JSON schema check for Cucumber JSON)
3. JUnit: confirm it opens in IntelliJ "Import External Test Result"
4. Cucumber JSON: feed to `cucumber-html-reporter`, confirm HTML generated

### hook-kit E2E (replaces existing test runner)

1. In hook-kit, delete `tests/features/run-pipeline.test.ts`
2. Run via CLI:

   ```bash
   bunx feats tests/features/*.feature --reporter pretty --reporter junit:out/junit.xml
   ```

3. Confirm:
   - Pretty output shows all scenarios with Given/When/Then context
   - `out/junit.xml` is created and valid
4. Restore `run-pipeline.test.ts` (or migrate hook-kit officially — separate PR)

### `Rule:` keyword smoke (in hook-kit)

1. Add a `Rule:` block to hook-kit's `run-pipeline.feature` with 2 scenarios
2. Run `bunx feats ...`; confirm both scenarios run
3. Add a rule-level tag `@rule-only`; run with `--tags @rule-only`; confirm
   only the rule's scenarios run

### Lifecycle hooks smoke

In hook-kit, add a `BeforeAll` that creates a temp dir, `AfterAll` that
cleans it up, and a `BeforeStep` that logs each step. Confirm:
- BeforeAll runs once before any scenario
- AfterAll runs once at the end (even when scenarios fail)
- BeforeStep runs on every step (visible in pretty output)

### `pending()` smoke

In hook-kit, mark one step with `pending("waiting on API change")`. Confirm:
- Pretty output shows yellow `~` next to that step
- JUnit XML marks the test as `<skipped>`
- Cucumber JSON marks as `"status": "pending"`
- Run exits 0 (default `failOnPending: false`)
- With `--fail-on-pending`, run exits 1

### Performance regression

Hyperfine the full hook-kit test suite (with and without reporters):
- Phase 0 baseline (no reporters, no CLI): T0
- Phase 2 with all three reporters active: T2

Require `T2 < T0 * 1.10` (≤10% slowdown).

---

## Audit checklist

- [ ] `bun run lint && bun run typecheck && bun test` — clean
- [ ] `bash scripts/e2e-hook-kit.sh` — clean (existing hook-kit tests still pass)
- [ ] hook-kit CLI migration E2E (section above) passes
- [ ] `/code-review` skill effort=high on the Phase 2 diff
- [ ] JUnit XML validates against a real CI parser (Jenkins or IntelliJ)
- [ ] Cucumber JSON consumed successfully by `cucumber-html-reporter`
- [ ] Performance: ≤10% slowdown over Phase 1 baseline (hyperfine on a
      100-scenario synthetic suite)
- [ ] CHANGELOG `Unreleased` → `[1.2.0] - YYYY-MM-DD`
- [ ] README updated; docs/ has reporters.md, cli.md, hooks.md, pending.md
- [ ] No file exceeds the 200-line cap (refactor reporters into per-class files
      if needed)
- [ ] `bun publish --dry-run` includes the new `bin` and `dist/cli/`
- [ ] All new public exports listed in README

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `core-runner` extraction breaks `runFeatures()` behavior | medium | Comprehensive tests on `runFeatures()` first as a black box; extract behind that test wall. |
| JUnit XML doesn't satisfy every CI parser | medium | Aim at Jenkins + IntelliJ formats (most permissive); document deviations. |
| Cucumber JSON shape drifts from spec | low | Pin to cucumber-html-reporter's expectations; smoke-test against it. |
| `Rule:` semantics confuse users (vs Feature, vs Scenario grouping) | medium | Match Gherkin 6 reference behavior exactly; cite spec in docs. |
| CLI step-file discovery picks up wrong files | medium | Only sibling `<base>.steps.ts` by default; require `--require` for anything else. |
| `BeforeStep` / `AfterStep` change runner timing semantics | low | Hooks are awaited individually; timing is per-hook. Document. |
| Adding `bin` entry forces `bun publish` to bundle CLI as ESM with shebang | low | Test `bun publish --dry-run` and `bunx @questi0nm4rk/feats` from the tarball before tagging. |

---

## Definition of done

1. Every Phase 2 checkbox `[x]`
2. Audit checklist green
3. `v1.2.0` tagged and published
4. hook-kit's tests have been *manually* run via the CLI at least once with all
   three reporters; output saved in this branch under `docs/audit-evidence/` (or
   referenced by commit)
5. README quick-start example uses the CLI
6. Open issue: "consider migrating hook-kit to the CLI" filed against hook-kit
   repo (separate PR)
