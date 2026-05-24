import { afterAll, beforeAll, describe, test } from "bun:test";
import type { Feature, ParsedStep, Scenario } from "@/parser/models";
import { matchStep } from "@/registry/expression-adapter";
import type { StepDefinition } from "@/registry/step-definition";
import { getRegistry } from "@/registry/step-registry";
import { formatStepError } from "@/reporting/error-formatter";
import { reportersFromEnv } from "@/reporting/from-env";
import type {
  FeatsReporter,
  FeatureResult,
  RunSummary,
  ScenarioResult,
  StepResult,
  StepStatus,
} from "@/reporting/reporter";
import type { HookDefinition } from "@/runner/hook-runner";
import { getAfterHooks, getBeforeHooks } from "@/runner/hook-runner";
import { matchesTagFilter } from "@/runner/tag-filter";
import type { World, WorldFactory } from "@/state/world";

export interface RunOptions {
  worldFactory?: WorldFactory;
  tagFilter?: string;
  reporters?: readonly FeatsReporter[];
}

// Worst-of step status — used to aggregate a scenario's status from its steps.
const STATUS_PRIORITY: Record<StepStatus, number> = {
  passed: 0,
  skipped: 1,
  pending: 2,
  undefined: 3,
  failed: 4,
};

function worstStatus(a: StepStatus, b: StepStatus): StepStatus {
  return STATUS_PRIORITY[a] >= STATUS_PRIORITY[b] ? a : b;
}

async function emit(
  reporters: readonly FeatsReporter[],
  method: keyof FeatsReporter,
  // biome-ignore lint/suspicious/noExplicitAny: variadic event payload
  ...args: any[]
): Promise<void> {
  for (const r of reporters) {
    const fn = r[method];
    if (typeof fn === "function") {
      await (fn as (...a: unknown[]) => Promise<void> | void).apply(r, args);
    }
  }
}

interface StepExecutionOutcome {
  readonly result: StepResult;
  readonly threw: boolean;
}

/**
 * Execute a single step, capturing timing + error. Does not throw; the
 * caller decides whether to short-circuit subsequent steps and whether to
 * re-throw for bun:test.
 */
async function executeStep(
  world: World,
  step: ParsedStep,
  definitions: readonly StepDefinition[],
): Promise<StepExecutionOutcome> {
  const start = performance.now();

  // matchStep throws on undefined or ambiguous — that's a step-level
  // outcome, not a runner crash.
  let match: ReturnType<typeof matchStep>;
  try {
    match = matchStep(definitions, step);
  } catch (err) {
    return {
      result: {
        step,
        status: "undefined",
        durationMs: performance.now() - start,
        error: err,
      },
      threw: true,
    };
  }

  const extraArgs: unknown[] = [];
  if (step.docString !== undefined) extraArgs.push(step.docString);
  if (step.dataTable !== undefined) extraArgs.push(step.dataTable);

  try {
    await match.definition.callback(world, ...match.args, ...extraArgs);
    return {
      result: { step, status: "passed", durationMs: performance.now() - start },
      threw: false,
    };
  } catch (err) {
    return {
      result: {
        step,
        status: "failed",
        durationMs: performance.now() - start,
        error: err,
      },
      threw: true,
    };
  }
}

/**
 * Run a sequence of steps (background + scenario), capturing per-step
 * results. Once one step throws, subsequent steps are emitted as "skipped".
 */
async function runStepsCapturing(
  world: World,
  steps: readonly ParsedStep[],
  definitions: readonly StepDefinition[],
  reporters: readonly FeatsReporter[],
): Promise<{ results: StepResult[]; firstError?: unknown; firstFailedStep?: ParsedStep }> {
  const results: StepResult[] = [];
  let firstError: unknown;
  let firstFailedStep: ParsedStep | undefined;

  for (const step of steps) {
    if (firstError !== undefined) {
      const skippedResult: StepResult = { step, status: "skipped", durationMs: 0 };
      results.push(skippedResult);
      await emit(reporters, "onStep", skippedResult);
      continue;
    }
    const outcome = await executeStep(world, step, definitions);
    results.push(outcome.result);
    await emit(reporters, "onStep", outcome.result);
    if (outcome.threw) {
      firstError = outcome.result.error;
      firstFailedStep = step;
    }
  }

  return {
    results,
    ...(firstError !== undefined ? { firstError } : {}),
    ...(firstFailedStep !== undefined ? { firstFailedStep } : {}),
  };
}

function collectReporters(opts: RunOptions | undefined): readonly FeatsReporter[] {
  if (opts?.reporters !== undefined) return opts.reporters;
  // Fall back to FEATS_REPORTERS env var so CI can attach reporters
  // without code changes. Examples:
  //   FEATS_REPORTERS=pretty
  //   FEATS_REPORTERS=pretty,junit:out.xml,cucumber-json:report.json
  return reportersFromEnv(process.env.FEATS_REPORTERS);
}

export function runFeatures(features: readonly Feature[], opts?: RunOptions): void {
  // Snapshot registry and hooks at registration time so that test lifecycle
  // hooks (e.g. beforeEach clearRegistry in other test files) do not affect them.
  const definitions = [...getRegistry().getAll()];
  const beforeHooks = [...getBeforeHooks()];
  const afterHooks = [...getAfterHooks()];

  const worldFactory: WorldFactory = opts?.worldFactory ?? (() => ({}));
  // `opts.tagFilter` wins; otherwise fall back to the FEATS_TAGS env var so
  // CI can filter without code changes (e.g. `FEATS_TAGS="@smoke" bun test`).
  const tagFilter = opts?.tagFilter ?? process.env.FEATS_TAGS ?? "";

  const reporters = collectReporters(opts);
  const reportingEnabled = reporters.length > 0;

  // Accumulators for feature- and run-level aggregation. Only allocated
  // when reporting is enabled.
  const runResults: ScenarioResult[] = [];
  const featureResults = new Map<Feature, ScenarioResult[]>();
  let runStartTime = 0;

  // onRunStart / onRunEnd fire in the FIRST feature's beforeAll and the
  // LAST feature's afterAll respectively. This lets assertion tests
  // declared AFTER runFeatures() observe the full event stream (their
  // describe blocks register after the feature describes, so they run
  // after the last feature's afterAll — i.e. after onRunEnd).
  //
  // If features is empty, no events fire — there's nothing to report.
  const lastIdx = features.length - 1;

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (feature === undefined) continue;
    const isFirst = i === 0;
    const isLast = i === lastIdx;

    describe(feature.name, () => {
      if (reportingEnabled) {
        featureResults.set(feature, []);
        beforeAll(async () => {
          if (isFirst) {
            runStartTime = performance.now();
            await emit(reporters, "onRunStart", features);
          }
          await emit(reporters, "onFeatureStart", feature);
        });
        afterAll(async () => {
          const scenarios = featureResults.get(feature) ?? [];
          const featureResult: FeatureResult = {
            feature,
            scenarios,
            durationMs: scenarios.reduce((sum, s) => sum + s.durationMs, 0),
          };
          await emit(reporters, "onFeatureEnd", featureResult);

          if (isLast) {
            const summary: RunSummary = {
              features: featureResults.size,
              scenarios: runResults.length,
              passed: runResults.filter((r) => r.status === "passed").length,
              failed: runResults.filter((r) => r.status === "failed").length,
              pending: runResults.filter((r) => r.status === "pending").length,
              skipped: runResults.filter((r) => r.status === "skipped").length,
              undefinedSteps: runResults.filter((r) => r.status === "undefined").length,
              durationMs: performance.now() - runStartTime,
            };
            await emit(reporters, "onRunEnd", summary);
          }
        });
      }

      for (const scenario of feature.scenarios) {
        const scenarioTags = [...feature.tags, ...scenario.tags];

        if (tagFilter !== "" && !matchesTagFilter(scenarioTags, tagFilter)) {
          test.skip(scenario.name, () => {});
          continue;
        }

        test(scenario.name, async () => {
          await runScenario({
            scenario,
            feature,
            scenarioTags,
            definitions,
            beforeHooks,
            afterHooks,
            worldFactory,
            reporters,
            reportingEnabled,
            runResults,
            featureResults,
          });
        });
      }
    });
  }
}

interface RunScenarioArgs {
  readonly scenario: Scenario;
  readonly feature: Feature;
  readonly scenarioTags: readonly { name: string }[];
  readonly definitions: readonly StepDefinition[];
  readonly beforeHooks: readonly HookDefinition[];
  readonly afterHooks: readonly HookDefinition[];
  readonly worldFactory: WorldFactory;
  readonly reporters: readonly FeatsReporter[];
  readonly reportingEnabled: boolean;
  readonly runResults: ScenarioResult[];
  readonly featureResults: Map<Feature, ScenarioResult[]>;
}

async function runScenario(args: RunScenarioArgs): Promise<void> {
  const {
    scenario,
    feature,
    scenarioTags,
    definitions,
    beforeHooks,
    afterHooks,
    worldFactory,
    reporters,
    reportingEnabled,
    runResults,
    featureResults,
  } = args;

  const scenarioStart = performance.now();
  if (reportingEnabled) {
    await emit(reporters, "onScenarioStart", scenario, feature);
  }

  const world = worldFactory();
  let stepError: unknown;
  let firstFailedStep: ParsedStep | undefined;
  let stepResults: StepResult[] = [];
  const afterErrors: unknown[] = [];

  try {
    for (const hook of beforeHooks) {
      if (hook.tagFilter === undefined || matchesTagFilter(scenarioTags, hook.tagFilter)) {
        await hook.callback(world);
      }
    }

    const allSteps =
      feature.background !== undefined
        ? [...feature.background.steps, ...scenario.steps]
        : scenario.steps;

    const outcome = await runStepsCapturing(world, allSteps, definitions, reporters);
    stepResults = outcome.results;
    if (outcome.firstError !== undefined) {
      stepError = outcome.firstError;
      firstFailedStep = outcome.firstFailedStep;
    }
  } catch (err: unknown) {
    // Before-hook errors land here. No step ran, so steps[] stays empty.
    stepError = err;
  } finally {
    for (const hook of afterHooks) {
      if (hook.tagFilter === undefined || matchesTagFilter(scenarioTags, hook.tagFilter)) {
        try {
          await hook.callback(world);
        } catch (hookErr: unknown) {
          afterErrors.push(hookErr);
        }
      }
    }
  }

  // Aggregate scenario status from step results + step error.
  let status: StepStatus = "passed";
  for (const sr of stepResults) status = worstStatus(status, sr.status);
  if (status === "passed" && stepError !== undefined) status = "failed";
  if (status === "passed" && afterErrors.length > 0) status = "failed";

  const aggregateError = buildScenarioError(stepError, afterErrors);

  if (reportingEnabled) {
    const scenarioResult: ScenarioResult = {
      scenario,
      feature,
      status,
      steps: stepResults,
      durationMs: performance.now() - scenarioStart,
      ...(aggregateError !== undefined ? { error: aggregateError } : {}),
    };
    runResults.push(scenarioResult);
    featureResults.get(feature)?.push(scenarioResult);
    await emit(reporters, "onScenarioEnd", scenarioResult);
  }

  // Now re-throw for bun:test's default rendering — same shape as Phase 1.
  if (stepError !== undefined && afterErrors.length > 0) {
    throw new AggregateError(
      [wrapStepError(firstFailedStep, stepError), ...afterErrors],
      "Scenario failed; After hook(s) also threw",
    );
  }
  if (stepError !== undefined) throw wrapStepError(firstFailedStep, stepError);
  if (afterErrors.length === 1) throw afterErrors[0];
  if (afterErrors.length > 1) throw new AggregateError(afterErrors, "After hook(s) threw");
}

function wrapStepError(step: ParsedStep | undefined, err: unknown): Error {
  if (step === undefined) {
    return err instanceof Error ? err : new Error(String(err));
  }
  return new Error(formatStepError(step, err), { cause: err });
}

function buildScenarioError(stepError: unknown, afterErrors: readonly unknown[]): unknown {
  if (stepError !== undefined && afterErrors.length > 0) {
    return new AggregateError([stepError, ...afterErrors], "step + after-hook failures");
  }
  if (stepError !== undefined) return stepError;
  if (afterErrors.length === 1) return afterErrors[0];
  if (afterErrors.length > 1) return new AggregateError(afterErrors, "after-hook failures");
  return undefined;
}

// Re-export HookDefinition for convenience
export type { HookDefinition };
