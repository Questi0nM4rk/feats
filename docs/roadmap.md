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
| 2 | Reporters, `Rule:`, lifecycle hooks, CLI | `1.2.0` (minor) | [phase-2-reporting.md](./phase-2-reporting.md) |

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
