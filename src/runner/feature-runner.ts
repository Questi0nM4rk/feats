import { describe, test } from "bun:test";
import type { Feature, ParsedStep } from "@/parser/models";
import { matchStep } from "@/registry/expression-adapter";
import type { StepDefinition } from "@/registry/step-definition";
import { getRegistry } from "@/registry/step-registry";
import type { HookDefinition } from "@/runner/hook-runner";
import { getAfterHooks, getBeforeHooks } from "@/runner/hook-runner";
import { matchesTagFilter } from "@/runner/tag-filter";
import type { World, WorldFactory } from "@/state/world";

export interface RunOptions {
  worldFactory?: WorldFactory;
  tagFilter?: string;
  seed?: number;
  fixtureDir?: string;
}

async function runSteps(
  world: World,
  steps: readonly ParsedStep[],
  definitions: readonly StepDefinition[],
): Promise<void> {
  for (const step of steps) {
    const match = matchStep(definitions, step.text);
    await match.definition.callback(world, ...match.args);
  }
}

export function runFeatures(features: readonly Feature[], opts?: RunOptions): void {
  // Snapshot registry and hooks at registration time so that test lifecycle
  // hooks (e.g. beforeEach clearRegistry in other test files) do not affect them.
  const definitions = [...getRegistry().getAll()];
  const beforeHooks = [...getBeforeHooks()];
  const afterHooks = [...getAfterHooks()];

  const worldFactory: WorldFactory = opts?.worldFactory ?? (() => ({}));
  const tagFilter = opts?.tagFilter ?? "";

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

          for (const hook of beforeHooks) {
            if (hook.tagFilter === undefined || matchesTagFilter(scenarioTags, hook.tagFilter)) {
              await hook.callback(world);
            }
          }

          try {
            if (feature.background !== undefined) {
              await runSteps(world, feature.background.steps, definitions);
            }
            await runSteps(world, scenario.steps, definitions);
          } finally {
            for (const hook of afterHooks) {
              if (hook.tagFilter === undefined || matchesTagFilter(scenarioTags, hook.tagFilter)) {
                await hook.callback(world);
              }
            }
          }
        });
      }
    });
  }
}

// Re-export HookDefinition for convenience
export type { HookDefinition };
