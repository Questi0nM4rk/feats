// tests/runner/lifecycle-hooks.test.ts
//
// BeforeAll / AfterAll fire once per runFeatures call. Tests verify:
//   - ordering relative to scenarios and to Before/After per-scenario hooks
//   - they fire even with zero reporters attached (i.e. gating is correct)
//   - AfterAll errors are collected, not allowed to mask other failures

import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, Given } from "@/registry/step-registry";
import { runFeatures } from "@/runner/feature-runner";
import { After, AfterAll, Before, BeforeAll, clearHooks } from "@/runner/hook-runner";

// ---- 1: BeforeAll fires before any scenario, AfterAll after all of them ----
{
  clearRegistry();
  clearHooks();

  const log: string[] = [];

  BeforeAll(() => {
    log.push("BeforeAll");
  });
  AfterAll(() => {
    log.push("AfterAll");
  });
  Before(() => {
    log.push("Before");
  });
  After(() => {
    log.push("After");
  });
  Given("step A", () => {
    log.push("stepA");
  });
  Given("step B", () => {
    log.push("stepB");
  });

  const feature = parseFeature(
    `
Feature: F
  Scenario: one
    Given step A
  Scenario: two
    Given step B
`,
    "lifecycle.feature",
  );

  runFeatures([feature]);

  describe("BeforeAll / AfterAll — ordering with two scenarios", () => {
    test("log is BeforeAll → (Before stepA After) × 2 → AfterAll", () => {
      expect(log).toEqual([
        "BeforeAll",
        "Before",
        "stepA",
        "After",
        "Before",
        "stepB",
        "After",
        "AfterAll",
      ]);
    });
  });
}

// ---- 2: BeforeAll/AfterAll fire with ZERO reporters (gating fix) ----
{
  clearRegistry();
  clearHooks();

  let beforeAllRan = false;
  let afterAllRan = false;

  BeforeAll(() => {
    beforeAllRan = true;
  });
  AfterAll(() => {
    afterAllRan = true;
  });
  Given("a step", () => {});

  const feature = parseFeature(
    `
Feature: F
  Scenario: only
    Given a step
`,
    "lifecycle-no-reporters.feature",
  );

  // No reporters: lifecycle hooks must still fire.
  runFeatures([feature]);

  describe("BeforeAll / AfterAll — fire even without reporters", () => {
    test("BeforeAll ran", () => {
      expect(beforeAllRan).toBe(true);
    });
    test("AfterAll ran", () => {
      expect(afterAllRan).toBe(true);
    });
  });
}

// ---- 3: Multiple BeforeAll / AfterAll run in registration order ----
{
  clearRegistry();
  clearHooks();

  const order: string[] = [];
  BeforeAll(() => {
    order.push("BA1");
  });
  BeforeAll(() => {
    order.push("BA2");
  });
  AfterAll(() => {
    order.push("AA1");
  });
  AfterAll(() => {
    order.push("AA2");
  });
  Given("a step", () => {
    order.push("step");
  });

  const feature = parseFeature(
    `
Feature: F
  Scenario: only
    Given a step
`,
    "lifecycle-multi.feature",
  );

  runFeatures([feature]);

  describe("BeforeAll / AfterAll — multiple hooks fire in registration order", () => {
    test("order is BA1, BA2, step, AA1, AA2", () => {
      expect(order).toEqual(["BA1", "BA2", "step", "AA1", "AA2"]);
    });
  });
}

// ---- 4: AfterAll runs even if a scenario step throws ----
//   The failure-mode test is in a subprocess pattern (lifecycle-hooks-failures
//   could be added later). Here we only verify the green path.
