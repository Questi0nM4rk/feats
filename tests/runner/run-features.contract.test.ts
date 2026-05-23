// run-features.contract.test.ts
//
// Black-box contract tests for runFeatures(). These pin the externally-
// observable behavior so that future refactors (notably Phase 2's
// core-runner extraction) cannot silently break the contract.
//
// Rules for editing this file:
//   - Each section uses a fresh, in-memory step set — no shared fixtures.
//   - Tests assert on observable state (logs, captured args, world contents),
//     NOT on internals.
//   - If a test here must change, that means runFeatures' observable behavior
//     changed. Call it out in the PR; do not "fix" the test silently.

import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, Given, getRegistry, When } from "@/registry/step-registry";
import { runFeatures } from "@/runner/feature-runner";
import { After, Before, clearHooks } from "@/runner/hook-runner";

// ---- 1: Background steps run before each scenario's steps ----
{
  clearRegistry();
  clearHooks();
  const log: string[] = [];

  Given("the background step", () => {
    log.push("bg");
  });
  Given("scenario A step", () => {
    log.push("A");
  });
  Given("scenario B step", () => {
    log.push("B");
  });

  const feature = parseFeature(
    `
Feature: Background ordering
  Background:
    Given the background step

  Scenario: A
    Given scenario A step

  Scenario: B
    Given scenario B step
`,
    "contract-bg.feature",
  );

  runFeatures([feature]);

  describe("contract: background runs before each scenario", () => {
    test("background fires once per scenario, in order", () => {
      expect(log).toEqual(["bg", "A", "bg", "B"]);
    });
  });
}

// ---- 2: Hooks fire in registration order ----
{
  clearRegistry();
  clearHooks();
  const log: string[] = [];

  Before(() => {
    log.push("before-1");
  });
  Before(() => {
    log.push("before-2");
  });
  After(() => {
    log.push("after-1");
  });
  After(() => {
    log.push("after-2");
  });
  Given("hook order step", () => {
    log.push("step");
  });

  const feature = parseFeature(
    `
Feature: Hook order
  Scenario: only
    Given hook order step
`,
    "contract-hooks.feature",
  );

  runFeatures([feature]);

  describe("contract: hooks fire in registration order", () => {
    test("before in order, then step, then after in order", () => {
      expect(log).toEqual(["before-1", "before-2", "step", "after-1", "after-2"]);
    });
  });
}

// ---- 3: World factory invoked exactly once per scenario ----
{
  clearRegistry();
  clearHooks();
  let factoryCalls = 0;

  Given("a factory-counting step", () => {
    // nothing
  });

  const feature = parseFeature(
    `
Feature: Factory invocation
  Scenario: one
    Given a factory-counting step

  Scenario: two
    Given a factory-counting step

  Scenario: three
    Given a factory-counting step
`,
    "contract-factory.feature",
  );

  runFeatures([feature], {
    worldFactory: () => {
      factoryCalls++;
      return {};
    },
  });

  describe("contract: world factory called once per scenario", () => {
    test("3 scenarios → 3 factory invocations", () => {
      expect(factoryCalls).toBe(3);
    });
  });
}

// ---- 4: Fresh world per scenario (no leakage) ----
{
  clearRegistry();
  clearHooks();

  Given("the world starts empty", (world: Record<string, unknown>) => {
    expect(world.flag).toBeUndefined();
    world.flag = true;
  });

  const feature = parseFeature(
    `
Feature: World isolation
  Scenario: first
    Given the world starts empty

  Scenario: second
    Given the world starts empty
`,
    "contract-world.feature",
  );

  runFeatures([feature]);
}

// ---- 5: Registry is snapshot at runFeatures call time ----
{
  clearRegistry();
  clearHooks();

  Given("a snapshot-protected step", () => {
    // nothing — the assertion is implicit (matching the step at all)
  });

  const feature = parseFeature(
    `
Feature: Snapshot
  Scenario: only
    Given a snapshot-protected step
`,
    "contract-snapshot.feature",
  );

  runFeatures([feature]);

  // Immediately wipe the registry. Because runFeatures snapshotted at call
  // time, the nested test should still find its step when bun:test runs it.
  clearRegistry();
  expect(getRegistry().getAll()).toHaveLength(0);
}

// ---- 6: DataTable and DocString are passed as the last positional args ----
{
  clearRegistry();
  clearHooks();
  const captured: { dataTable?: unknown; docString?: unknown } = {};

  Given("a step with a doc string", (_world, docString: unknown) => {
    captured.docString = docString;
  });
  Given("a step with a data table", (_world, dataTable: unknown) => {
    captured.dataTable = dataTable;
  });

  const feature = parseFeature(
    `
Feature: Step args
  Scenario: doc string
    Given a step with a doc string
      """
      hello world
      """

  Scenario: data table
    Given a step with a data table
      | name | role  |
      | Ada  | admin |
`,
    "contract-args.feature",
  );

  runFeatures([feature]);

  describe("contract: doc string and data table pass through", () => {
    test("doc string captured as raw text", () => {
      expect(captured.docString).toBe("hello world");
    });

    test("data table captured with helpers", () => {
      const dt = captured.dataTable as { asObjects: () => Record<string, string>[] };
      expect(dt.asObjects()).toEqual([{ name: "Ada", role: "admin" }]);
    });
  });
}

// ---- 7: Empty feature (no scenarios) produces a describe with no tests ----
{
  clearRegistry();
  clearHooks();

  const feature = parseFeature(
    `
Feature: Empty
`,
    "contract-empty.feature",
  );

  // The contract is that this does not throw. The describe block is created
  // by runFeatures with zero tests inside it. bun:test reports zero tests
  // for that describe — visible in the run summary, no exception thrown.
  expect(() => runFeatures([feature])).not.toThrow();
}

// ---- 8: Multiple runFeatures() calls in the same process work independently ----
{
  clearRegistry();
  clearHooks();
  const log: string[] = [];

  Given("first-batch step", () => {
    log.push("first");
  });
  const featureA = parseFeature(
    `
Feature: First batch
  Scenario: only
    Given first-batch step
`,
    "contract-multi-a.feature",
  );
  runFeatures([featureA]);

  clearRegistry();
  Given("second-batch step", () => {
    log.push("second");
  });
  const featureB = parseFeature(
    `
Feature: Second batch
  Scenario: only
    Given second-batch step
`,
    "contract-multi-b.feature",
  );
  runFeatures([featureB]);

  describe("contract: multiple runFeatures calls", () => {
    test("each batch's steps run, isolated", () => {
      expect(log).toContain("first");
      expect(log).toContain("second");
    });
  });
}

// ---- 9: Step args passed positionally from cucumber-expression matches ----
{
  clearRegistry();
  clearHooks();
  let captured: unknown[] = [];

  When("I enter {string} as user {int}", (_world, name: unknown, id: unknown) => {
    captured = [name, id];
  });

  const feature = parseFeature(
    `
Feature: Positional args
  Scenario: only
    When I enter "alice" as user 42
`,
    "contract-args-positional.feature",
  );

  runFeatures([feature]);

  describe("contract: cucumber-expression args land in callback order", () => {
    test("first {string}, then {int}", () => {
      expect(captured).toEqual(["alice", 42]);
    });
  });
}
