# feats — Release Roadmap (Phases 0 → 2)

This document is the master plan for taking `@questi0nm4rk/feats` from `1.0.1` to a
SpecFlow-grade-but-minimal BDD runner. It defines three phases. Each phase has its
own detail doc with task lists, code-level guidance, an end-to-end test plan, and
an audit checklist.

## Phase summary

| Phase | Theme | Target version | Detail doc |
|-------|-------|----------------|-----------|
| 0 | Cleanup, foundation, bug fixes | `1.0.2` (patch) | [phase-0-cleanup.md](./phase-0-cleanup.md) |
| 1 | Wire existing dead code + small DX wins | `1.1.0` (minor) | [phase-1-wiring.md](./phase-1-wiring.md) |
| 2a | Reporter contract + Pretty / JUnit / Cucumber JSON | `1.2.0` (minor) ✅ | [phase-2-reporting.md](./phase-2-reporting.md) |
| 2b | `Rule:`, `BeforeAll` / `AfterAll`, pending step | `1.3.0` (minor) | [phase-2-reporting.md](./phase-2-reporting.md) |
| 2c | CLI binary + `core-runner` extraction | `1.4.0` (minor) | [phase-2-reporting.md](./phase-2-reporting.md) |

All three phases are **non-breaking**. Removal of under-adopted exports (`assertConfig`,
`assertOutput`, `runCli`, the Bun plugin) is deferred to a hypothetical `2.0.0`.

## Guiding principles

1. **Wire before you write.** Phase 1 mostly hooks up code that already exists in
   `src/reporting/`. Don't add new code where dead code already covers the case.
2. **Stay minimal.** Anything that would force users to learn a DI container, a
   plugin protocol, or a custom IDE is out of scope. See "non-goals" below.
3. **Audit each phase.** Every phase ends with a code-review pass + a hook-kit E2E
   run before merge.
4. **Backwards compat is non-negotiable** through `1.x`. No renamed exports, no
   changed tag-filter semantics, no parser behavior changes that would break the
   `1.0.1` consumer contract that hook-kit and ai-guardrails depend on.

## Non-goals (do NOT add)

- Dependency-injection container of any kind. World stays as `Record<string, unknown>`.
- "Living documentation" HTML reports or report-server. Ship Cucumber JSON; let
  the existing ecosystem render it.
- IDE plugins, language-server integrations, or generator tooling.
- Test parallelism inside a feature file — `bun:test` already parallelizes at the
  file level. Don't fight it.
- Retry-on-flake policies. If a user needs retry, they wrap their own step.
- Multi-language Gherkin (`# language: fr`) until a real user asks. The current
  `GherkinClassicTokenMatcher` covers 100% of observed usage.
- External plugin protocol. The existing Bun plugin is enough; do not invent a
  reporter or matcher plugin API beyond what Phase 2 ships.
- Azure DevOps / Jira / TestRail / TFS bridges. JUnit XML covers all of these via
  generic CI plumbing.

## hook-kit E2E harness

Both Phase 1 and Phase 2 must verify changes against hook-kit's actual feature
tests. The harness uses `bun link`:

1. In feats: `bun link` to register the local package.
2. In hook-kit: `bun link @questi0nm4rk/feats` to use the linked version instead
   of the npm 1.0.1 pin.
3. Run hook-kit's test suite: `cd ../hook-kit && bun test tests/features/`.
4. Restore: `bun unlink` in both directions.

This is scripted in `scripts/e2e-hook-kit.sh` (created in Phase 0). The script
assumes `hook-kit` is checked out as a sibling directory; it skips with a clear
message if not.

## Versioning + release flow

- Each phase ends with a tag (`v1.0.2`, `v1.1.0`, `v1.2.0`) and a CHANGELOG entry.
- Pre-release candidates (`1.1.0-rc.0`, etc.) may be cut during Phase 1/2 for
  hook-kit E2E without polluting the npm "latest" tag.
- `bun publish` only after the audit checklist for that phase is fully green.

## Sequencing

Phases run in order. Phase 1 depends on the After-hook fix and the dead-duplicate
cleanup from Phase 0. Phase 2 depends on the reporter-shaped output contract that
Phase 1 leaves behind (Gherkin-formatted error messages). Do not start a phase
before the previous one's audit checklist is signed off.

## Decision log (open items)

These are decisions that were made unilaterally while drafting the plan. Flag any
you want to overturn before Phase 0 starts.

- **D1**: `assertConfig`, `assertOutput`, `runCli`, Bun plugin remain exported.
  Status: kept. Phase 0 adds usage docs; future phases re-evaluate adoption.
- **D2**: `setupFixture` / `composeFixtures` / `createRng` stay as-is. ai-guardrails
  is the only consumer but it uses them heavily and idiomatically.
- **D3**: hook-kit E2E uses `bun link`, not a private prerelease tag. Simpler;
  works offline.
- **D4**: `Rule:` lands in Phase 2, not Phase 0. The parser silently drops Rules
  today (`parser/adapter.ts` does not branch on `child.rule`); making it a no-op
  is OK as long as no consumer uses it yet (verified — none do).
- **D5**: Tag-filter parens land in Phase 1, not Phase 2 (small, isolated change).
- **D6**: `failOnPending` defaults to `false`. Matches Cucumber across all major
  implementations.
- **D7**: File-output reporters (JUnit XML, Cucumber JSON) are first-class
  under the CLI, "best-effort" under multi-file `bun test`. Filename pattern
  with `{n}` placeholder supported; same-path collision throws fail-fast.
- **D8**: `BeforeAll`/`AfterAll` tag filter = "run if ≥1 scenario in the
  feature matches the filter" (single pre-pass over `feature.scenarios`).

## Revision log

### Rev 1 — post-first-read audit

After writing the initial plan and re-reading with fresh eyes, surfaced 8
caveats and made 4 reshuffles. Summary:

**Caveats addressed:**
1. **Semver violation in Phase 0.** New exports (`clearRegistry`, etc.) are
   API additions, not bug fixes — would have forced a minor bump while still
   targeting `1.0.2`. Fix: moved all 6 new exports to Phase 1.
2. **No safety net for Phase 2's `core-runner` extraction.** Fix: added Phase
   0 §0.14 — black-box regression suite for `runFeatures` that Phase 2 must
   pass unchanged.
3. **No perf baseline.** Phase 1 and 2 reference budgets without one. Fix:
   added Phase 0 §0.13 — `bench/` harness with committed baseline file per
   release.
4. **bun:test ↔ CLI "run" semantics tension.** File reporters write one file
   per "run", but a "run" means different things under each mode. Fix:
   documented in Phase 2 architecture; D7 above.
5. **Reporter contract collides with Phase 1's error wrap.** Fix: Phase 1
   now documents the contract — reporters see raw `step` + `error`; the
   wrap is a `bun:test` rendering helper only.
6. **`BeforeAll` tag-filter semantics undefined.** Fix: D8 above.
7. **Snippet generator without placeholder substitution is half a feature.**
   Fix: promoted Phase 1 §1.7 from "optional polish" to required, with
   defined substitution rules.
8. **Phase 0.9 CI audit was research-shaped, not deliverable-shaped.** Fix:
   rewrote with concrete required jobs, branch protection, bench workflow.

**Reshuffles applied:**
- Phase 0 → Phase 1: `clearRegistry`, `clearHooks`, `clearParameterTypeRegistry`,
  `resetFeats`, `isDataTable`, `isDocString` (now Phase 1 §1.8 and §1.9)
- Phase 0 added: §0.13 perf bench, §0.14 regression suite
- Phase 1: §1.7 promoted from optional to required
- Phase 0.9 rewritten with concrete deliverables

**Net effect on phase shape:**
- Phase 0 is slightly *larger* (gained bench + regression suite) but strictly
  scoped (no exports). Still targets `1.0.2`.
- Phase 1 is slightly *larger* (gained 6 exports + promoted snippet sub).
  Still targets `1.1.0`.
- Phase 2 unchanged in scope but has clearer architectural decisions.

**Items NOT moved (considered and rejected):**
- `Rule:` keyword to Phase 0 — would expand Phase 0's semantic surface
  (model decisions about tag inheritance, background merging) for no
  consumer-visible benefit. Stays in Phase 2.
- `BeforeAll`/`AfterAll` to Phase 1 — small enough to fit, but breaks the
  Phase 1 theme ("wire dead code + DX wins around errors"). Stays in Phase 2.
- `pending()` to Phase 1 — without reporter visualization (yellow ~, JUnit
  `<skipped>`, Cucumber `"pending"`), it would just be a silently-passing
  test, weaker than the current "step throws Not Implemented" pattern.
  Stays in Phase 2 alongside reporters.
