import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, Given, Then, When } from "@/registry/step-registry";
import { runFeatures } from "@/runner/feature-runner";
import { After, Before, clearHooks } from "@/runner/hook-runner";

// runFeatures registers describe/test blocks via bun:test's describe/test.
// These must be called at module scope (not inside test()).
// Each group calls clearRegistry/clearHooks before registering to avoid cross-contamination.
// We do NOT use beforeEach(clearRegistry) here because it would clear registrations
// before the nested test blocks (created by runFeatures) execute.

// --- Steps execute in order, world is mutated ---
{
  clearRegistry();
  clearHooks();

  const executionOrder: string[] = [];

  Given("the counter is {int}", (world: Record<string, unknown>, initial: unknown) => {
    world.counter = initial;
    executionOrder.push("given");
  });

  When("I increment the counter", (world: Record<string, unknown>) => {
    const c = world.counter;
    if (typeof c === "number") world.counter = c + 1;
    executionOrder.push("when");
  });

  Then("the counter should be {int}", (world: Record<string, unknown>, expected: unknown) => {
    executionOrder.push("then");
    expect(world.counter).toBe(expected);
  });

  const feature = parseFeature(
    `
Feature: Counter
  Scenario: Steps mutate world in order
    Given the counter is 0
    When I increment the counter
    Then the counter should be 1
`,
    "counter.feature",
  );

  runFeatures([feature]);
}

// --- Fresh world per scenario ---
{
  clearRegistry();
  clearHooks();

  Given("isolation state is set", (world: Record<string, unknown>) => {
    world.set = true;
  });

  Given("isolation state is absent", (world: Record<string, unknown>) => {
    expect(world.set).toBeUndefined();
  });

  const feature = parseFeature(
    `
Feature: World isolation
  Scenario: First scenario sets state
    Given isolation state is set

  Scenario: Second scenario has fresh world
    Given isolation state is absent
`,
    "isolation.feature",
  );

  runFeatures([feature]);
}

// --- Background steps run before scenario steps ---
{
  clearRegistry();
  clearHooks();

  Given("background step ran", (world: Record<string, unknown>) => {
    world.background = true;
  });

  Then("background state is present", (world: Record<string, unknown>) => {
    expect(world.background).toBe(true);
  });

  const feature = parseFeature(
    `
Feature: Background
  Background:
    Given background step ran

  Scenario: Scenario sees background state
    Then background state is present
`,
    "background.feature",
  );

  runFeatures([feature]);
}

// --- Tag filtering: @smoke passes, @slow is skipped ---
{
  clearRegistry();
  clearHooks();

  Given("a smoke-tagged step", () => {
    // intentionally empty — this should run
  });

  Given("a slow-tagged step", () => {
    throw new Error("slow step should have been skipped");
  });

  const feature = parseFeature(
    `
Feature: Tag filtering
  @smoke
  Scenario: Smoke scenario
    Given a smoke-tagged step

  @slow
  Scenario: Slow scenario
    Given a slow-tagged step
`,
    "tags.feature",
  );

  runFeatures([feature], { tagFilter: "@smoke" });
}

// --- Multiple features ---
{
  clearRegistry();
  clearHooks();

  Given("feature A unique step", (world: Record<string, unknown>) => {
    world.feature = "A";
  });

  Given("feature B unique step", (world: Record<string, unknown>) => {
    world.feature = "B";
  });

  const featureA = parseFeature(
    `
Feature: Feature A
  Scenario: Scenario in A
    Given feature A unique step
`,
    "a.feature",
  );

  const featureB = parseFeature(
    `
Feature: Feature B
  Scenario: Scenario in B
    Given feature B unique step
`,
    "b.feature",
  );

  runFeatures([featureA, featureB]);
}

// --- Before/After hooks execute around scenarios ---
{
  clearRegistry();
  clearHooks();

  const hookLog: string[] = [];

  Before(() => {
    hookLog.push("before");
  });

  After(() => {
    hookLog.push("after");
  });

  Given("a hook test step", () => {
    hookLog.push("step");
  });

  const feature = parseFeature(
    `
Feature: Hooks
  Scenario: Hooks run around a scenario
    Given a hook test step
`,
    "hooks.feature",
  );

  runFeatures([feature]);

  describe("runFeatures — hook execution order", () => {
    test("before, step, after log is populated after scenario runs", () => {
      // hookLog is populated during the nested test execution by runFeatures above.
      // By the time this test runs, the nested "Hooks > Hooks run around a scenario"
      // test has already run, so hookLog contains the execution log.
      expect(hookLog).toEqual(["before", "step", "after"]);
    });
  });
}

// --- Tag-filtered hooks: hook only fires for matching tags ---
{
  clearRegistry();
  clearHooks();

  const taggedHookLog: string[] = [];

  Before("@smoke", () => {
    taggedHookLog.push("smoke-before");
  });

  Given("a tagged hook step", () => {
    taggedHookLog.push("tagged-step");
  });

  Given("a non-tagged hook step", () => {
    taggedHookLog.push("non-tagged-step");
  });

  const feature = parseFeature(
    `
Feature: Tagged hooks
  @smoke
  Scenario: Smoke scenario with tagged hook
    Given a tagged hook step

  @slow
  Scenario: Slow scenario without smoke hook
    Given a non-tagged hook step
`,
    "tagged-hooks.feature",
  );

  runFeatures([feature]);

  describe("runFeatures — tagged hook filtering", () => {
    test("tagged hook log contains smoke-before only for @smoke scenario", () => {
      // After nested tests run: ["smoke-before", "tagged-step", "non-tagged-step"]
      expect(taggedHookLog).toContain("smoke-before");
      expect(taggedHookLog).toContain("tagged-step");
      expect(taggedHookLog).toContain("non-tagged-step");
      // smoke-before appears exactly once (only for @smoke scenario)
      const smokeBeforeCount = taggedHookLog.filter((e) => e === "smoke-before").length;
      expect(smokeBeforeCount).toBe(1);
    });
  });
}
