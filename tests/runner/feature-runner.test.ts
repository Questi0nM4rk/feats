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
//
// LOAD-BEARING SKIP: the @slow scenario's step body throws on purpose. The
// runner converts filter-excluded scenarios into bun:test `test.skip(...)`
// blocks (src/runner/feature-runner.ts:56), so this test PROVES filtering
// works by ensuring the throwing step never executes. The "1 skip" in the
// suite's overall pass/skip/fail summary comes from here; don't try to
// "fix" it by removing the @slow scenario.
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

// --- Feature-level tags are inherited by scenarios for filtering ---
// Tags declared above `Feature:` apply to every scenario inside it. The
// runner merges [...feature.tags, ...scenario.tags] before evaluating the
// filter. This block proves a scenario with no own tags still matches a
// feature-tagged filter, and an exclusion at the feature level skips
// every scenario inside.
{
  clearRegistry();
  clearHooks();

  Given("an inherited-tag step", () => {});

  // tagFilter "@smoke" — feature is @smoke, scenarios have no own tags.
  // Both scenarios should run because the feature tag is inherited.
  const featureTaggedInheritance = parseFeature(
    `
@smoke
Feature: All scenarios inherit @smoke
  Scenario: First inherits
    Given an inherited-tag step

  Scenario: Second inherits
    Given an inherited-tag step
`,
    "feature-inherit.feature",
  );

  runFeatures([featureTaggedInheritance], { tagFilter: "@smoke" });
}

// --- Feature-level tag exclusion skips every scenario ---
//
// LOAD-BEARING SKIP: both scenarios' step bodies throw on purpose, same
// pattern as the @smoke/@slow block above. Filtering with `not @slow`
// should skip both because @slow is on the feature.
{
  clearRegistry();
  clearHooks();

  Given("a never-run step", () => {
    throw new Error("feature-level @slow exclusion should have skipped this");
  });

  const featureExcluded = parseFeature(
    `
@slow
Feature: All scenarios excluded by feature tag
  Scenario: First excluded
    Given a never-run step

  Scenario: Second excluded
    Given a never-run step
`,
    "feature-exclude.feature",
  );

  runFeatures([featureExcluded], { tagFilter: "not @slow" });
}

// --- Complex parenthesized filter against multi-tagged scenarios ---
// Adds runtime coverage for the §1.4 parens feature against a scenario
// that carries multiple tags. Filter: (@smoke or @critical) and not @wip.
//   - @smoke + @critical (no @wip) → runs
//   - @critical + @wip            → skips
//   - @wip alone                   → skips
{
  clearRegistry();
  clearHooks();

  Given("a runs-under-complex-filter step", () => {});
  Given("a never-runs-under-complex-filter step", () => {
    throw new Error("complex filter exclusion should have skipped this");
  });

  const multiTag = parseFeature(
    `
Feature: Complex filter
  @smoke @critical
  Scenario: Should run
    Given a runs-under-complex-filter step

  @critical @wip
  Scenario: Skipped by wip exclusion
    Given a never-runs-under-complex-filter step

  @wip
  Scenario: Skipped by missing required tag
    Given a never-runs-under-complex-filter step
`,
    "complex-filter.feature",
  );

  runFeatures([multiTag], { tagFilter: "(@smoke or @critical) and not @wip" });
}
