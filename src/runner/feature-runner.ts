import { describe, test } from "bun:test";
import type { Feature, ParsedStep } from "@/parser/models";
import { matchStep } from "@/registry/expression-adapter";
import type { StepDefinition } from "@/registry/step-definition";
import { getRegistry } from "@/registry/step-registry";
import { formatStepError } from "@/reporting/error-formatter";
import type { HookDefinition } from "@/runner/hook-runner";
import { getAfterHooks, getBeforeHooks } from "@/runner/hook-runner";
import { matchesTagFilter } from "@/runner/tag-filter";
import type { World, WorldFactory } from "@/state/world";

export interface RunOptions {
  worldFactory?: WorldFactory;
  tagFilter?: string;
}

async function runSteps(
  world: World,
  steps: readonly ParsedStep[],
  definitions: readonly StepDefinition[],
): Promise<void> {
  for (const step of steps) {
    const match = matchStep(definitions, step);
    const extraArgs: unknown[] = [];
    if (step.docString !== undefined) extraArgs.push(step.docString);
    if (step.dataTable !== undefined) extraArgs.push(step.dataTable);
    try {
      await match.definition.callback(world, ...match.args, ...extraArgs);
    } catch (err) {
      // Wrap with Gherkin context for bun:test's default rendering. The
      // original error remains reachable via `.cause`; Phase 2 reporters
      // will use it to render their own way.
      throw new Error(formatStepError(step, err), { cause: err });
    }
  }
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

  for (const feature of features) {
    describe(feature.name, () => {
      for (const scenario of feature.scenarios) {
        const scenarioTags = [...feature.tags, ...scenario.tags];

        if (tagFilter !== "" && !matchesTagFilter(scenarioTags, tagFilter)) {
          test.skip(scenario.name, () => {});
          continue;
        }

        test(scenario.name, async () => {
          const world = worldFactory();

          let stepError: unknown;
          const afterErrors: unknown[] = [];

          try {
            for (const hook of beforeHooks) {
              if (hook.tagFilter === undefined || matchesTagFilter(scenarioTags, hook.tagFilter)) {
                await hook.callback(world);
              }
            }

            if (feature.background !== undefined) {
              await runSteps(world, feature.background.steps, definitions);
            }
            await runSteps(world, scenario.steps, definitions);
          } catch (err: unknown) {
            stepError = err;
          } finally {
            // After hooks always run, even on step failure. Their errors are
            // collected (not thrown immediately) so we can report both step
            // and hook failures without one masking the other.
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

          if (stepError !== undefined && afterErrors.length > 0) {
            throw new AggregateError(
              [stepError, ...afterErrors],
              "Scenario failed; After hook(s) also threw",
            );
          }
          if (stepError !== undefined) throw stepError;
          if (afterErrors.length === 1) throw afterErrors[0];
          if (afterErrors.length > 1) {
            throw new AggregateError(afterErrors, "After hook(s) threw");
          }
        });
      }
    });
  }
}

// Re-export HookDefinition for convenience
export type { HookDefinition };
