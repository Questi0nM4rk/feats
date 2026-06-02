// tests/runner/run-scenario-pure.test.ts
//
// Direct unit tests for runScenarioPure — the newly exported per-scenario
// engine shared by runFeatures (bun:test wrapper) and runCore (CLI runner).
//
// These tests verify the function's contract: it returns a ScenarioOutcome
// without throwing on step/hook failures, and emits reporter events correctly.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import type { StepDefinition } from "@/registry/step-definition";
import { clearRegistry, Given } from "@/registry/step-registry";
import { getRegistry } from "@/registry/step-registry";
import type { FeatsReporter } from "@/reporting/reporter";
import { runScenarioPure } from "@/runner/feature-runner";
import { After, Before, clearHooks } from "@/runner/hook-runner";
import { pending } from "@/runner/pending";

function getFeatureAndScenario(featureText: string, filename = "f.feature") {
  const feature = parseFeature(featureText, filename);
  const scenario = feature.scenarios[0];
  if (scenario === undefined) throw new Error("No scenario in feature text");
  return { feature, scenario };
}

function getDefinitions(): StepDefinition[] {
  return [...getRegistry().getAll()];
}

beforeEach(() => {
  clearRegistry();
  clearHooks();
});
afterEach(() => {
  clearRegistry();
  clearHooks();
});

describe("runScenarioPure — basic outcome", () => {
  test("passing step → result.status='passed', stepError=undefined", async () => {
    Given("a passing step", () => {});
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given a passing step
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [...feature.tags, ...scenario.tags],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("passed");
    expect(outcome.stepError).toBeUndefined();
    expect(outcome.afterErrors).toHaveLength(0);
  });

  test("throwing step → result.status='failed', stepError is the thrown Error", async () => {
    const boom = new Error("BOOM");
    Given("a failing step", () => {
      throw boom;
    });
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given a failing step
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [...feature.tags, ...scenario.tags],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("failed");
    expect(outcome.stepError).toBe(boom);
    expect(outcome.firstFailedStep).toBeDefined();
  });

  test("undefined step → result.status='undefined'", async () => {
    // No step registered — so the step is undefined.
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given there is no matching step
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: [],
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("undefined");
  });

  test("pending step → result.status='pending'", async () => {
    Given("a pending step", () => {
      pending("not implemented yet");
    });
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given a pending step
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("pending");
  });
});

describe("runScenarioPure — never throws on failure", () => {
  test("does NOT throw even when a step throws", async () => {
    Given("boom step", () => {
      throw new Error("explosion");
    });
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given boom step
`);

    // Confirm it resolves rather than rejects.
    await expect(
      runScenarioPure({
        scenario,
        feature,
        scenarioTags: [],
        definitions: getDefinitions(),
        beforeHooks: [],
        afterHooks: [],
        worldFactory: () => ({}),
        reporters: [],
      }),
    ).resolves.toBeDefined();
  });

  test("After-hook error is collected into afterErrors, not thrown", async () => {
    Given("step ok", () => {});
    const afterError = new Error("after-hook-failure");

    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given step ok
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [{ tagFilter: undefined, callback: () => { throw afterError; } }],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.afterErrors).toHaveLength(1);
    expect(outcome.afterErrors[0]).toBe(afterError);
    expect(outcome.result.status).toBe("failed");
  });
});

describe("runScenarioPure — reporter events", () => {
  test("emits onScenarioStart then onScenarioEnd with correct scenario reference", async () => {
    Given("reported step", () => {});
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given reported step
`);

    const started: unknown[] = [];
    const ended: unknown[] = [];
    const reporter: FeatsReporter = {
      onScenarioStart: (s) => { started.push(s); },
      onScenarioEnd: (r) => { ended.push(r); },
    };

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [reporter],
    });

    expect(started).toHaveLength(1);
    expect(started[0]).toBe(scenario);
    expect(ended).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: test narrowing
    expect((ended[0] as any).scenario).toBe(scenario);
  });

  test("onStep is called once per step with the step result", async () => {
    Given("step one", () => {});
    Given("step two", () => {});
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given step one
    Given step two
`);

    const stepResults: unknown[] = [];
    const reporter: FeatsReporter = {
      onStep: (r) => { stepResults.push(r); },
    };

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [reporter],
    });

    expect(stepResults).toHaveLength(2);
  });
});

describe("runScenarioPure — world factory", () => {
  test("worldFactory is called once per scenario, world is passed to steps", async () => {
    const worlds: unknown[] = [];
    Given("step with world", (world: unknown) => {
      worlds.push(world);
    });
    const sentinelWorld = { id: "sentinel" };
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given step with world
`);

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => sentinelWorld,
      reporters: [],
    });

    expect(worlds).toHaveLength(1);
    expect(worlds[0]).toBe(sentinelWorld);
  });
});

describe("runScenarioPure — before hook error", () => {
  test("Before hook error sets result.status='failed' and stepError is set", async () => {
    const hookError = new Error("before-hook-blew-up");
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given any step
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [{ tagFilter: undefined, callback: () => { throw hookError; } }],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("failed");
    // stepError is set from the before-hook catch path.
    expect(outcome.stepError).toBe(hookError);
  });
});

describe("runScenarioPure — result shape", () => {
  test("result.durationMs is a non-negative number", async () => {
    Given("timed step", () => {});
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given timed step
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(typeof outcome.result.durationMs).toBe("number");
    expect(outcome.result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("result contains references to the original scenario and feature", async () => {
    Given("reference step", () => {});
    const { feature, scenario } = getFeatureAndScenario(`
Feature: F
  Scenario: s
    Given reference step
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: getDefinitions(),
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.scenario).toBe(scenario);
    expect(outcome.result.feature).toBe(feature);
  });
});
