// tests/runner/run-scenario-pure.test.ts
//
// Direct unit tests for the newly exported `runScenarioPure` function in
// src/runner/feature-runner.ts (added in Phase 2c). Exercises background
// steps, Before/After hook ordering, tag-filtered hooks, step skipping,
// and the returned ScenarioOutcome structure.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, getRegistry, Given } from "@/registry/step-registry";
import type { FeatsReporter, StepResult } from "@/reporting/reporter";
import { runScenarioPure } from "@/runner/feature-runner";
import {
  After,
  Before,
  clearHooks,
  getAfterHooks,
  getBeforeHooks,
} from "@/runner/hook-runner";
import { pending } from "@/runner/pending";

// Helper: extract the first scenario from a feature string.
function firstScenario(featureText: string) {
  const feature = parseFeature(featureText, "test.feature");
  const scenario = feature.scenarios[0];
  if (scenario === undefined) throw new Error("No scenarios in feature");
  return { feature, scenario };
}

beforeEach(() => {
  clearRegistry();
  clearHooks();
});
afterEach(() => {
  clearRegistry();
  clearHooks();
});

// ─── basic outcome shape ───────────────────────────────────────────────────

describe("runScenarioPure — passing scenario", () => {
  test("returns result with status=passed and no error", async () => {
    Given("passing step", () => {});

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given passing step
`);

    const defs = [...getRegistry().getAll()];

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [...feature.tags, ...scenario.tags],
      definitions: defs,
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("passed");
    expect(outcome.result.error).toBeUndefined();
    expect(outcome.stepError).toBeUndefined();
    expect(outcome.afterErrors).toHaveLength(0);
  });
});

describe("runScenarioPure — undefined step", () => {
  test("returns result with status=undefined when no definition matches", async () => {
    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given there is no step definition for this
`);

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: [], // empty — nothing matches
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("undefined");
    expect(outcome.stepError).toBeDefined();
  });
});

describe("runScenarioPure — failing step", () => {
  test("returns status=failed and captures stepError", async () => {
    Given("a failing step", () => {
      throw new Error("BOOM");
    });

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given a failing step
`);

    const defs = [...getRegistry().getAll()];

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("failed");
    expect(outcome.stepError).toBeDefined();
    expect(outcome.firstFailedStep).toBeDefined();
    expect(outcome.afterErrors).toHaveLength(0);
  });

  test("steps after the first failure are marked skipped", async () => {
    Given("a failing step", () => {
      throw new Error("first fail");
    });
    Given("a subsequent step", () => {});

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given a failing step
    Given a subsequent step
`);

    const defs = [...getRegistry().getAll()];

    const stepStatuses: string[] = [];
    const reporter: FeatsReporter = {
      onStep: (r: StepResult) => {
        stepStatuses.push(r.status);
      },
    };

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [reporter],
    });

    expect(stepStatuses).toEqual(["failed", "skipped"]);
  });
});

describe("runScenarioPure — pending step", () => {
  test("returns status=pending and stepError is PendingError", async () => {
    Given("a pending step", () => {
      pending("not yet");
    });

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given a pending step
`);

    const defs = [...getRegistry().getAll()];

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(outcome.result.status).toBe("pending");
    // stepError is the PendingError — present but isPendingError-branded
    expect(outcome.stepError).toBeDefined();
  });
});

// ─── background steps ────────────────────────────────────────────────────────

describe("runScenarioPure — background steps", () => {
  test("background steps run before scenario steps", async () => {
    const order: string[] = [];
    Given("background step", () => {
      order.push("background");
    });
    Given("scenario step", () => {
      order.push("scenario");
    });

    const feature = parseFeature(
      `
Feature: F
  Background:
    Given background step
  Scenario: s
    Given scenario step
`,
      "test.feature",
    );
    const scenario = feature.scenarios[0]!;

    const defs = [...getRegistry().getAll()];

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(order).toEqual(["background", "scenario"]);
  });

  test("background failure skips scenario steps", async () => {
    Given("failing background", () => {
      throw new Error("bg fail");
    });
    Given("scenario step", () => {});

    const feature = parseFeature(
      `
Feature: F
  Background:
    Given failing background
  Scenario: s
    Given scenario step
`,
      "test.feature",
    );
    const scenario = feature.scenarios[0]!;

    const defs = [...getRegistry().getAll()];

    const stepStatuses: string[] = [];
    const reporter: FeatsReporter = {
      onStep: (r: StepResult) => {
        stepStatuses.push(r.status);
      },
    };

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [reporter],
    });

    expect(outcome.result.status).toBe("failed");
    expect(stepStatuses[0]).toBe("failed");
    expect(stepStatuses[1]).toBe("skipped");
  });
});

// ─── Before / After hooks ────────────────────────────────────────────────────

describe("runScenarioPure — Before hook ordering", () => {
  test("Before hook runs before steps, world is shared", async () => {
    const order: string[] = [];

    Before((world: Record<string, unknown>) => {
      world.flag = true;
      order.push("before");
    });

    Given("reads world flag", (world: Record<string, unknown>) => {
      expect(world.flag).toBe(true);
      order.push("step");
    });

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given reads world flag
`);

    const defs = [...getRegistry().getAll()];
    const befores = getBeforeHooks();

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: befores,
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(order).toEqual(["before", "step"]);
  });

  test("Before hook error → scenario status=failed, steps skipped", async () => {
    Before(() => {
      throw new Error("before boom");
    });

    Given("should not run", () => {});

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given should not run
`);

    const defs = [...getRegistry().getAll()];
    const befores = getBeforeHooks();

    const stepStatuses: string[] = [];
    const reporter: FeatsReporter = {
      onStep: (r: StepResult) => {
        stepStatuses.push(r.status);
      },
    };

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: befores,
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [reporter],
    });

    expect(outcome.result.status).toBe("failed");
    expect(outcome.stepError).toBeDefined();
    // steps array should be empty — before hook aborted before any step ran
    expect(outcome.result.steps).toHaveLength(0);
  });
});

describe("runScenarioPure — After hook", () => {
  test("After hook runs after steps, errors collected in afterErrors", async () => {
    Given("a step", () => {});
    After(() => {
      throw new Error("after boom");
    });

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given a step
`);

    const defs = [...getRegistry().getAll()];
    const afters = getAfterHooks();

    const outcome = await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: afters,
      worldFactory: () => ({}),
      reporters: [],
    });

    // After hook error captured, not thrown
    expect(outcome.afterErrors).toHaveLength(1);
    expect(outcome.result.status).toBe("failed");
  });

  test("After hook runs even when a step fails", async () => {
    let afterRan = false;
    Given("a failing step", () => {
      throw new Error("step fail");
    });
    After(() => {
      afterRan = true;
    });

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given a failing step
`);

    const defs = [...getRegistry().getAll()];
    const afters = getAfterHooks();

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: afters,
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(afterRan).toBe(true);
  });
});

// ─── tag-filtered hooks ───────────────────────────────────────────────────────

describe("runScenarioPure — tag-filtered hooks", () => {
  test("Before hook with tag filter only fires when scenario has that tag", async () => {
    const fired: string[] = [];

    Before("@smoke", () => {
      fired.push("before:smoke");
    });

    Given("a step", () => {});

    const featureText = `
Feature: F
  @smoke
  Scenario: tagged
    Given a step
  Scenario: untagged
    Given a step
`;

    const feature = parseFeature(featureText, "test.feature");
    const defs = [...getRegistry().getAll()];
    const befores = getBeforeHooks();

    // Run tagged scenario
    const taggedScenario = feature.scenarios[0]!;
    await runScenarioPure({
      scenario: taggedScenario,
      feature,
      scenarioTags: [...feature.tags, ...taggedScenario.tags],
      definitions: defs,
      beforeHooks: befores,
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    // Run untagged scenario
    const untaggedScenario = feature.scenarios[1]!;
    await runScenarioPure({
      scenario: untaggedScenario,
      feature,
      scenarioTags: [...feature.tags, ...untaggedScenario.tags],
      definitions: defs,
      beforeHooks: befores,
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [],
    });

    expect(fired).toEqual(["before:smoke"]);
  });

  test("After hook with tag filter only fires when scenario has that tag", async () => {
    const fired: string[] = [];

    After("@smoke", () => {
      fired.push("after:smoke");
    });

    Given("a step", () => {});

    const feature = parseFeature(
      `
Feature: F
  @smoke
  Scenario: tagged
    Given a step
  Scenario: untagged
    Given a step
`,
      "test.feature",
    );

    const defs = [...getRegistry().getAll()];
    const afters = getAfterHooks();

    for (const scenario of feature.scenarios) {
      await runScenarioPure({
        scenario,
        feature,
        scenarioTags: [...feature.tags, ...scenario.tags],
        definitions: defs,
        beforeHooks: [],
        afterHooks: afters,
        worldFactory: () => ({}),
        reporters: [],
      });
    }

    expect(fired).toEqual(["after:smoke"]);
  });
});

// ─── reporter events ──────────────────────────────────────────────────────────

describe("runScenarioPure — reporter events", () => {
  test("emits onScenarioStart, onStep per step, onScenarioEnd", async () => {
    Given("event step", () => {});

    const { feature, scenario } = firstScenario(`
Feature: F
  Scenario: s
    Given event step
`);

    const defs = [...getRegistry().getAll()];

    const events: string[] = [];
    const reporter: FeatsReporter = {
      onScenarioStart: (s) => {
        events.push(`scenarioStart:${s.name}`);
      },
      onStep: (r: StepResult) => {
        events.push(`step:${r.status}`);
      },
      onScenarioEnd: (r) => {
        events.push(`scenarioEnd:${r.status}`);
      },
    };

    await runScenarioPure({
      scenario,
      feature,
      scenarioTags: [],
      definitions: defs,
      beforeHooks: [],
      afterHooks: [],
      worldFactory: () => ({}),
      reporters: [reporter],
    });

    expect(events).toEqual(["scenarioStart:s", "step:passed", "scenarioEnd:passed"]);
  });
});
