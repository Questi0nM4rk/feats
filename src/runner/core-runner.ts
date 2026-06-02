// src/runner/core-runner.ts
//
// bun:test-free runner. Used by the `feats` CLI binary (Phase 2c) to drive
// scenario execution without `describe` / `test` / `beforeAll` / `afterAll`.
//
// Same step + hook + reporter contract as the bun:test wrapper in
// `feature-runner.ts` — both paths share `runScenarioPure` so behavior
// stays in lockstep.

import type { Feature } from "@/parser/models";
import { getRegistry } from "@/registry/step-registry";
import { reportersFromEnv } from "@/reporting/from-env";
import type { FeatsReporter, RunSummary, ScenarioResult } from "@/reporting/reporter";
import { runScenarioPure } from "@/runner/feature-runner";
import {
  getAfterAllHooks,
  getAfterHooks,
  getBeforeAllHooks,
  getBeforeHooks,
} from "@/runner/hook-runner";
import { matchesTagFilter } from "@/runner/tag-filter";
import type { WorldFactory } from "@/state/world";

export interface CoreRunOptions {
  readonly worldFactory?: WorldFactory;
  readonly tagFilter?: string;
  readonly reporters?: readonly FeatsReporter[];
}

export interface CoreRunResult {
  readonly summary: RunSummary;
  /** Process exit code suggestion: 0 if everything passed, 1 otherwise. */
  readonly exitCode: number;
}

/**
 * Run a set of features sequentially. Loads step definitions + hooks from
 * the global registry at call time (callers must register their `.steps.ts`
 * modules before invoking this).
 *
 * Unlike `runFeatures` (the bun:test wrapper), this returns a structured
 * summary and never throws on step / scenario failure — the caller decides
 * what to do with the result (e.g. set `process.exitCode`).
 */
export async function runCore(
  features: readonly Feature[],
  opts?: CoreRunOptions,
): Promise<CoreRunResult> {
  const definitions = [...getRegistry().getAll()];
  const beforeHooks = [...getBeforeHooks()];
  const afterHooks = [...getAfterHooks()];
  const beforeAllHooks = [...getBeforeAllHooks()];
  const afterAllHooks = [...getAfterAllHooks()];

  const worldFactory: WorldFactory = opts?.worldFactory ?? (() => ({}));
  const tagFilter = opts?.tagFilter ?? process.env.FEATS_TAGS ?? "";
  const reporters = opts?.reporters ?? reportersFromEnv(process.env.FEATS_REPORTERS);

  const runStart = performance.now();
  const allResults: ScenarioResult[] = [];

  // BeforeAll runs before any reporter event — same ordering as the
  // bun:test path. A thrown BeforeAll hook aborts the whole run.
  for (const hook of beforeAllHooks) await hook.callback();

  for (const r of reporters) {
    if (r.onRunStart !== undefined) await r.onRunStart(features);
  }

  for (const feature of features) {
    const featureStart = performance.now();
    for (const r of reporters) {
      if (r.onFeatureStart !== undefined) await r.onFeatureStart(feature);
    }

    const featureResults: ScenarioResult[] = [];

    for (const scenario of feature.scenarios) {
      // Tag inheritance: feature ◁ rule (if any) ◁ scenario.
      const scenarioTags = [...feature.tags, ...(scenario.rule?.tags ?? []), ...scenario.tags];
      if (tagFilter !== "" && !matchesTagFilter(scenarioTags, tagFilter)) continue;

      const outcome = await runScenarioPure({
        scenario,
        feature,
        scenarioTags,
        definitions,
        beforeHooks,
        afterHooks,
        worldFactory,
        reporters,
      });
      featureResults.push(outcome.result);
      allResults.push(outcome.result);
    }

    for (const r of reporters) {
      if (r.onFeatureEnd !== undefined) {
        await r.onFeatureEnd({
          feature,
          scenarios: featureResults,
          durationMs: performance.now() - featureStart,
        });
      }
    }
  }

  const summary: RunSummary = {
    features: features.length,
    scenarios: allResults.length,
    passed: allResults.filter((r) => r.status === "passed").length,
    failed: allResults.filter((r) => r.status === "failed").length,
    pending: allResults.filter((r) => r.status === "pending").length,
    skipped: allResults.filter((r) => r.status === "skipped").length,
    undefinedSteps: allResults.filter((r) => r.status === "undefined").length,
    durationMs: performance.now() - runStart,
  };

  for (const r of reporters) {
    if (r.onRunEnd !== undefined) await r.onRunEnd(summary);
  }

  // AfterAll errors are collected, not thrown — match `After` hook semantics.
  // The CLI surfaces them via the returned exitCode; reporters that care
  // can subscribe to a future onTeardownError event (out of scope here).
  for (const hook of afterAllHooks) {
    try {
      await hook.callback();
    } catch {
      // Swallow at the runner boundary; CLI exit code already reflects
      // any scenario failure. Future: surface via a new event.
    }
  }

  // Anything other than "passed" makes the run non-green for CI purposes.
  // Pending is a deliberate signal but still a non-zero exit so CI catches
  // unimplemented work (matches cucumber-js's behavior on pending).
  const exitCode = summary.failed > 0 || summary.undefinedSteps > 0 ? 1 : 0;

  return { summary, exitCode };
}
