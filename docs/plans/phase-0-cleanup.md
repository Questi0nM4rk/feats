# Phase 0 — Cleanup & Foundation

**Target version:** `1.0.2` (patch) — bug fixes + foundation only, **no public
API additions** (strict semver discipline).

**Goal:** Pay off internal debt, fix two correctness bugs, fill test gaps,
build the harness (CI + hook-kit E2E + CHANGELOG) that Phases 1 and 2 rely on,
and establish two safety nets: a black-box regression suite for `runFeatures`
and a perf bench. Both are prerequisites for Phase 2's refactor and the perf
budget enforced in later phases.

**Scope discipline:** Phase 0 ships **zero new exports**. Internal helpers may
be added, but `src/feats.ts` does not gain a single export this phase. New
exports land in Phase 1 (which is already a minor bump).

---

## In scope

- 2 correctness bugs (After-hook swallow, outline scenario name collision)
- Dead code removal (`scenario-runner.ts`)
- YAML hardening
- Test-coverage gaps in `reporting/`, `cli/`, `plugin/`, tag-filter edge cases
- **Black-box regression test suite** for `runFeatures` (Phase 2 refactor safety net)
- **`bench/` perf harness** with 100-scenario synthetic suite (baseline for Phase 1/2)
- `CHANGELOG.md`, semver policy doc, contributor notes
- CI workflow audit + concrete gating changes
- `scripts/e2e-hook-kit.sh` (the harness used by Phases 1 and 2)
- Docs for the under-adopted exports (`assertConfig`/`assertOutput`/`runCli`/plugin)

## Out of scope

- **All new exports** (moved to Phase 1: `clearRegistry`, `clearHooks`,
  `clearParameterTypeRegistry`, `resetFeats`, `isDataTable`, `isDocString`)
- Any change to the runner's output format (deferred to Phase 1)
- Any new hook, reporter, parser keyword (deferred to Phase 2)
- Any breaking change to exports

---

## Task list

### 0.1 Fix After-hook silent failure swap

**Bug:** `src/runner/feature-runner.ts:49-71`. The `try` block captures step
failures into `beforeError`. The `finally` runs After hooks but does **not**
catch their errors — so if an After hook throws, that hook's error propagates
out of the test body and *replaces* the original `beforeError` (or fails a
passing scenario). Cleanup failures masquerade as step failures, and step
failures masquerade as cleanup failures.

**Fix:** Collect After-hook errors. After the loop, if both a step error and
one or more hook errors exist, throw an `AggregateError`. If only one, throw it.

```ts
// feature-runner.ts:62 area — replace the finally block
const afterErrors: unknown[] = [];
try {
  // ... step execution (unchanged)
} catch (err: unknown) {
  beforeError = err;
} finally {
  for (const hook of afterHooks) {
    if (hook.tagFilter === undefined || matchesTagFilter(scenarioTags, hook.tagFilter)) {
      try {
        await hook.callback(world);
      } catch (hookErr) {
        afterErrors.push(hookErr);
      }
    }
  }
}

if (beforeError !== undefined && afterErrors.length > 0) {
  throw new AggregateError([beforeError, ...afterErrors], "Step and After-hook failures");
}
if (beforeError !== undefined) throw beforeError;
if (afterErrors.length === 1) throw afterErrors[0];
if (afterErrors.length > 1) throw new AggregateError(afterErrors, "After-hook failures");
```

**Tests to add** (`tests/runner/after-hook-errors.test.ts`):
- [ ] Step passes, single After hook throws → After-hook error surfaces.
- [ ] Step fails, After hook also throws → both errors visible (AggregateError).
- [ ] Step passes, two After hooks throw → AggregateError with both.
- [ ] Step fails, After hook succeeds → step error surfaces as before (regression).

**Acceptance:** new tests pass, existing tests unchanged.

- [ ] Implemented in `feature-runner.ts`
- [ ] Tests written and passing
- [ ] No existing test broke

### 0.2 Fix outline scenario name collision

**Bug:** `src/parser/adapter.ts:174-179`. When a `Scenario Outline:` has no
`<placeholder>` in the name, all compiled scenarios end up with the same
`scenario.name`. `bun:test` then renders multiple `test("Add item", ...)` blocks
with identical names — the test report can't disambiguate which row failed.

**Fix:** When expanding outline scenarios, if the resulting compiled names are
identical, append the example values: `"Add item [count=3, total=29.97]"`.
Easier alternative: always append a 1-based index `"Add item [1]"` if names
collide within the group.

**Approach:**

```ts
// adapter.ts compiledScenarioToScenario or its caller
function disambiguateNames(scenarios: Scenario[]): Scenario[] {
  const seen = new Map<string, number>();
  return scenarios.map((s) => {
    const n = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, n);
    const hasDup = scenarios.filter(o => o.name === s.name).length > 1;
    return hasDup ? { ...s, name: `${s.name} [${n}]` } : s;
  });
}
```

Better: extract the example row values from the pickle (`pickle.astNodeIds` →
look up `TableRow` → cells) and embed them. But the simple index suffix is the
minimum that fixes the bug.

**Tests:**
- [ ] Outline with placeholders in name → names stay distinct, no suffix added.
- [ ] Outline without placeholders, 3 examples → names get `[1]`, `[2]`, `[3]`.
- [ ] Non-outline scenarios with same name across features → untouched (this is
      a per-outline disambiguation, not global).

- [ ] Implemented
- [ ] Tests written
- [ ] Manual check: run a feature with a Scenario Outline and `bun test --verbose`

### 0.3 Delete dead duplicate `scenario-runner.ts`

`src/runner/scenario-runner.ts:6-13` duplicates the logic in
`feature-runner.ts:17-24` (`runSteps` inner loop) and is not exported from
`feats.ts`. Pure dead code.

- [ ] Delete `src/runner/scenario-runner.ts`
- [ ] Verify nothing imports it: `rg "scenario-runner" src/ tests/`
- [ ] `bun test` and `bun run typecheck` clean

### 0.4 YAML parsing hardening

`src/assertions/config-assertions.ts:18` calls `yaml.parse(text)` with no
options. The `yaml` library is vulnerable to "billion laughs" via unbounded
anchor expansion if asserting on user-supplied YAML.

**Fix:**

```ts
yaml.parse(text, { maxAliasCount: 100 })
```

100 is a generous limit that allows legitimate aliases while bounding worst-case
expansion. (Setting to `0` disables aliases entirely; too strict for real configs.)

- [ ] Patched
- [ ] Test added with a YAML file containing one legitimate alias (still works)
- [ ] Test added with an attacker-style YAML (expands beyond 100) → throws

### 0.5 (MOVED to Phase 1) — DataTable type guards

Originally planned here, but exporting `isDataTable` / `isDocString` adds new
public API and violates the patch-version discipline of Phase 0. See
`phase-1-wiring.md §1.8`.

### 0.6 (MOVED to Phase 1) — Test-isolation helper exports

Originally planned here, but exporting `clearRegistry` / `clearHooks` /
`clearParameterTypeRegistry` / `resetFeats` adds new public API. See
`phase-1-wiring.md §1.9`.

### 0.7 Test coverage gaps

Audit results (from initial review):
- `tests/reporting/` — empty or missing for `error-formatter.ts`, `pending-steps.ts`
- `tests/cli/` — exists but thin; missing timeout, signal, env-merge cases
- `tests/plugin/` — bun-plugin.ts is untested
- `tests/runner/tag-filter.test.ts` — precedence edge cases missing

**Tests to add:**
- [ ] `tests/reporting/error-formatter.test.ts` — formats step + error with
      `uri:line`, keyword, text, message
- [ ] `tests/reporting/pending-steps.test.ts` — snippet generates valid TS, escapes
      backslashes and quotes, maps `And`/`But` to `Step`
- [ ] `tests/cli/cli-runner-timeout.test.ts` — timeout fires, process killed
- [ ] `tests/plugin/bun-plugin.test.ts` — integration test using Bun.build
- [ ] `tests/runner/tag-filter-precedence.test.ts` — `not (a and b)`, `a or b and c`,
      `not a and b`, double-negation

### 0.8 CHANGELOG + semver policy

- [ ] Create `CHANGELOG.md` (Keep a Changelog format)
- [ ] Backfill `1.0.0`, `1.0.1` from git tags
- [ ] Add `Unreleased` section, start populating as Phase 0 tasks land
- [ ] Add `SEMVER.md` or section in `CONTRIBUTING.md`: "1.x is non-breaking; any
      removed export requires a major bump"

### 0.9 CI workflow audit + gating

Concrete deliverables (not just "go read the files"):

- [ ] Inventory every file in `.github/workflows/`. Record in
      `docs/ci-inventory.md`: trigger, jobs, what fails the build.
- [ ] **Required job on PRs:** `bun test` (all tests must pass). Add if missing.
- [ ] **Required job on PRs:** `biome check src/ tests/` (lint must be clean).
- [ ] **Required job on PRs:** `tsc --noEmit` (typecheck must be clean).
- [ ] **Required job on PRs:** `bun publish --dry-run` (catches packaging bugs).
- [ ] **New workflow** `bench.yml`: runs the bench from §0.13 on PRs that
      touch `src/runner/**` or `src/parser/**`. Records timing; comments on PR
      if it regresses by >10% vs `main` baseline.
- [ ] Cache `~/.bun/install/cache` keyed on `bun.lock` hash to speed CI.
- [ ] Branch protection: require all the above jobs to be green before merge
      to `main`.

### 0.10 hook-kit E2E harness

Create `scripts/e2e-hook-kit.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

FEATS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_KIT_DIR="${HOOK_KIT_DIR:-$FEATS_DIR/../hook-kit}"

if [[ ! -d "$HOOK_KIT_DIR" ]]; then
  echo "skip: hook-kit not found at $HOOK_KIT_DIR (set HOOK_KIT_DIR to override)"
  exit 0
fi

echo "==> Building feats"
cd "$FEATS_DIR"
bun install --frozen-lockfile
bun run build
bun run build:types

echo "==> Linking feats into hook-kit"
bun link
cd "$HOOK_KIT_DIR"
bun link @questi0nm4rk/feats

echo "==> Running hook-kit feature tests"
bun test tests/features/

echo "==> Unlinking"
bun unlink @questi0nm4rk/feats || true
cd "$FEATS_DIR"
bun unlink || true

echo "==> Done"
```

- [ ] Script committed and `chmod +x`-ed
- [ ] Documented in CONTRIBUTING.md
- [ ] Run manually once; passes on current `main` against hook-kit's existing tests

### 0.11 Document under-adopted exports

`assertConfig`, `assertOutput`, `runCli`, the Bun plugin — none are used by any
consumer. Phase 0 keeps them and writes docs so we can re-evaluate at end of
Phase 2 with adoption data.

- [ ] `docs/assertions.md` with `assertConfig` + `assertOutput` examples
- [ ] `docs/runCli.md` with a fixture-based CLI smoke test example
- [ ] `docs/bun-plugin.md` with a worked example of importing `.feature` files
      as modules

### 0.12 Decision: ParameterType `useForSnippets` flag

`src/registry/parameter-types.ts:18` calls
`new ParameterType(name, regexp, null, transformer, true, false)`. The trailing
`false` is `preferForRegexpMatch`; the `true` is `useForSnippets`. Both are correct,
but with no comment a future reader will have to look this up. Add a comment.

- [ ] Add inline comment naming both flags

### 0.13 Perf bench harness (baseline for Phase 1 & 2)

**Why:** Phase 1 budgets "≤2% slowdown" and Phase 2 budgets "≤10% slowdown",
but there's no baseline. Build one now, freeze a number, and re-run it at the
end of each phase.

**Deliverables:**
- [ ] `bench/synthetic.feature` — 100 scenarios with mixed Given/When/Then,
      one Background, one Scenario Outline with 10 examples
- [ ] `bench/synthetic.steps.ts` — pure in-memory step defs (no I/O)
- [ ] `bench/run.ts` — invokes `runFeatures()` N times, records median + p95
- [ ] `bench/README.md` — how to run, how to interpret
- [ ] `package.json` script: `"bench": "bun run bench/run.ts"`
- [ ] Baseline recorded in `bench/baseline-1.0.2.json` (committed). Future
      phases compare against this and write their own `baseline-1.x.x.json`.

**Caveat:** bench must run on the same machine to be comparable. CI bench
(§0.9) compares PR vs `main` HEAD on the same runner, not against the
committed baseline (which is informational only across machines).

### 0.14 Black-box regression suite for `runFeatures`

**Why:** Phase 2 extracts a `core-runner` from `feature-runner.ts` so the CLI
can drive it independently of `bun:test`. Without a regression suite, the
refactor lands blind — there is no current test that pins the externally-
observable behavior of `runFeatures` end-to-end.

**Deliverables in `tests/runner/run-features.contract.test.ts`:**
- [ ] Each Background step runs before each scenario's steps
- [ ] Hooks fire in registration order
- [ ] Tag filter on scenarios works (smoke for the tag-filter pathway through
      the runner, not the tag-filter parser itself)
- [ ] World factory is invoked exactly once per scenario
- [ ] World is not shared between scenarios in the same feature (fresh per test)
- [ ] Registry is snapshot at `runFeatures()` call time — subsequent
      `clear()` does not affect the in-flight run
- [ ] Multiple `runFeatures()` calls in the same process work independently
- [ ] Empty feature (no scenarios) produces a `describe` with no `test`s
- [ ] DataTable and DocString are passed as the last positional args
- [ ] Outline scenarios receive the correct example row values

Use a custom in-memory step set inside the test — don't depend on the existing
test fixtures (they were the model for the runner's design and would
tautologically pass).

These tests become the contract Phase 2's `core-runner` must satisfy.

---

## End-to-end test plan

### Local pre-merge run

1. `bun install --frozen-lockfile`
2. `bun run lint && bun run typecheck && bun test`
3. `bash scripts/e2e-hook-kit.sh` — must pass (hook-kit's existing tests run
   green against linked feats)
4. Manual sanity:
   - Write a temporary `.feature` with a `Scenario Outline:` (no `<placeholder>`
     in name) and 3 examples. Run with `bun test --verbose`. Confirm distinct
     names in output.
   - Write a step where the After hook throws. Confirm `AggregateError` (or
     single After error) surfaces, not silently swallowed.

### Regression guard

The runner's externally-visible behavior must not change except in the two
bug-fix cases. Run:
- [ ] `bun test` on `main` vs branch — only the new tests and bug-fix tests
      should differ in pass/fail.
- [ ] hook-kit E2E identical output (sans the fix-only changes — there should
      be none, since hook-kit doesn't use Scenario Outlines or After hooks).

---

## Audit checklist

Run **before** tagging `v1.0.2`.

- [ ] `bun run lint` clean
- [ ] `bun run typecheck` clean
- [ ] `bun test` 100% pass, no skipped tests outside of platform-specific cases
- [ ] `bun publish --dry-run` produces a sensible tarball (no `src/`, no test
      files, `dist/` only — verify `package.json:files`)
- [ ] `scripts/e2e-hook-kit.sh` exits 0
- [ ] `bun run bench` produces a baseline; committed as `bench/baseline-1.0.2.json`
- [ ] `/code-review` skill with effort=high on the full Phase 0 diff — review
      every flagged finding
- [ ] CHANGELOG `Unreleased` section moved to `[1.0.2] - YYYY-MM-DD`
- [ ] **Zero new exports** in `src/feats.ts` (verify with `git diff main -- src/feats.ts`)
- [ ] No file in `src/` exceeds the 200-line cap from `.cc-review.yaml`

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| AggregateError breaks consumer error-handling expectations | low | Both consumers don't catch errors from runFeatures; bun:test displays. AggregateError prints both messages by default. |
| Outline name change breaks tooling that parses `bun test` output by name | very low | The change only affects names that were ambiguous before — no tooling can have been relying on duplicates. |
| YAML alias limit (100) rejects a legitimate config | low | 100 is generous; document and make tunable in Phase 1 if needed. |
| `bun link` interferes with hook-kit's pinned 1.0.1 | low | Script unlinks on exit; CI doesn't use link. |

---

## Definition of done

Phase 0 is complete when:

1. Every `[ ]` checkbox in this doc is `[x]`
2. The audit checklist is fully green
3. `v1.0.2` is tagged and published
4. CHANGELOG entry is written
5. Phase 1 doc is unblocked (no foundation work outstanding)
