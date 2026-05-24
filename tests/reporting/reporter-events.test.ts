// tests/reporting/reporter-events.test.ts
//
// Black-box contract tests for the reporter event stream. A recording
// reporter captures every event and we assert ordering + payload shape.
// This is the safety net that Phase 2c's `core-runner` extraction will
// have to pass unchanged.

import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, Given, Then, When } from "@/registry/step-registry";
import type { FeatsReporter } from "@/reporting/reporter";
import { runFeatures } from "@/runner/feature-runner";
import { clearHooks } from "@/runner/hook-runner";

interface RecordedEvent {
  readonly type: keyof FeatsReporter;
  readonly payload: unknown;
}

function recordingReporter(): {
  events: RecordedEvent[];
  reporter: FeatsReporter;
} {
  const events: RecordedEvent[] = [];
  const reporter: FeatsReporter = {
    onRunStart: (features) => {
      events.push({ type: "onRunStart", payload: { count: features.length } });
    },
    onFeatureStart: (feature) => {
      events.push({ type: "onFeatureStart", payload: { name: feature.name } });
    },
    onScenarioStart: (scenario, feature) => {
      events.push({
        type: "onScenarioStart",
        payload: { scenario: scenario.name, feature: feature.name },
      });
    },
    onStep: (result) => {
      events.push({
        type: "onStep",
        payload: { text: result.step.text, status: result.status },
      });
    },
    onScenarioEnd: (result) => {
      events.push({
        type: "onScenarioEnd",
        payload: {
          scenario: result.scenario.name,
          status: result.status,
          steps: result.steps.length,
        },
      });
    },
    onFeatureEnd: (result) => {
      events.push({
        type: "onFeatureEnd",
        payload: { name: result.feature.name, scenarios: result.scenarios.length },
      });
    },
    onRunEnd: (summary) => {
      events.push({
        type: "onRunEnd",
        payload: {
          features: summary.features,
          scenarios: summary.scenarios,
          passed: summary.passed,
          failed: summary.failed,
        },
      });
    },
  };
  return { events, reporter };
}

// ---- Test 1: passing scenario emits all events in canonical order ----
{
  clearRegistry();
  clearHooks();
  const { events, reporter } = recordingReporter();

  Given("a passing step", () => {});
  When("I do a thing", () => {});
  Then("it works", () => {});

  const feature = parseFeature(
    `
Feature: F
  Scenario: happy path
    Given a passing step
    When I do a thing
    Then it works
`,
    "events-1.feature",
  );

  runFeatures([feature], { reporters: [reporter] });

  describe("reporter event order — passing scenario", () => {
    test("emits onRunStart → onFeatureStart → onScenarioStart → 3× onStep → onScenarioEnd → onFeatureEnd → onRunEnd", () => {
      const types = events.map((e) => e.type);
      expect(types).toEqual([
        "onRunStart",
        "onFeatureStart",
        "onScenarioStart",
        "onStep",
        "onStep",
        "onStep",
        "onScenarioEnd",
        "onFeatureEnd",
        "onRunEnd",
      ]);
    });

    test("step payload carries text and status", () => {
      const stepEvents = events.filter((e) => e.type === "onStep");
      expect(stepEvents).toHaveLength(3);
      const payloads = stepEvents.map((e) => e.payload as { text: string; status: string });
      expect(payloads.map((p) => p.status)).toEqual(["passed", "passed", "passed"]);
      expect(payloads.map((p) => p.text)).toEqual(["a passing step", "I do a thing", "it works"]);
    });

    test("onScenarioEnd reports passed status + 3 steps", () => {
      const scenEnd = events.find((e) => e.type === "onScenarioEnd");
      expect(scenEnd?.payload).toEqual({ scenario: "happy path", status: "passed", steps: 3 });
    });

    test("onRunEnd summary counts 1 feature, 1 scenario, 1 passed", () => {
      const runEnd = events.find((e) => e.type === "onRunEnd");
      expect(runEnd?.payload).toEqual({ features: 1, scenarios: 1, passed: 1, failed: 0 });
    });
  });
}

// NOTE: failure-mode event tests (failed step, undefined step, raw-error
// preservation) live in tests/reporting/reporter-events-failures.test.ts.
// They spawn subprocesses so the expected-failure inner scenarios don't
// pollute this file's bun:test output.

// ---- Test 4: filtered scenarios emit NO per-scenario events ----
{
  clearRegistry();
  clearHooks();
  const { events, reporter } = recordingReporter();

  Given("a smoke step", () => {});
  Given("a slow step", () => {});

  const feature = parseFeature(
    `
Feature: F
  @smoke
  Scenario: smoke
    Given a smoke step
  @slow
  Scenario: slow
    Given a slow step
`,
    "events-4.feature",
  );

  runFeatures([feature], { reporters: [reporter], tagFilter: "@smoke" });

  describe("reporter event — filtered scenarios are silent (cucumber-js parity)", () => {
    test("only one onScenarioStart fires (the @smoke one)", () => {
      const starts = events.filter((e) => e.type === "onScenarioStart");
      expect(starts).toHaveLength(1);
      expect((starts[0]?.payload as { scenario: string }).scenario).toBe("smoke");
    });

    test("the @slow scenario does NOT appear in any event", () => {
      const slowMentions = events.filter((e) => JSON.stringify(e.payload).includes("slow"));
      expect(slowMentions).toHaveLength(0);
    });

    test("summary counts 1 scenario (not 2) — filtered ones aren't part of the run", () => {
      const runEnd = events.find((e) => e.type === "onRunEnd");
      expect((runEnd?.payload as { scenarios: number }).scenarios).toBe(1);
    });
  });
}

// ---- Test 5: zero reporters → no overhead, no errors ----
{
  clearRegistry();
  clearHooks();

  Given("a step", () => {});

  const feature = parseFeature(
    `
Feature: No reporters
  Scenario: only
    Given a step
`,
    "events-5.feature",
  );

  // No opts.reporters — same as Phase 1 behavior.
  runFeatures([feature]);

  // No reporter to inspect; just confirms zero-reporter path doesn't throw.
  // Existing 264 tests already cover that this scenario runs correctly.
}

// ---- Test 6: multiple reporters fire in registration order ----
{
  clearRegistry();
  clearHooks();

  const orderLog: string[] = [];
  const r1: FeatsReporter = {
    onStep: () => {
      orderLog.push("r1");
    },
  };
  const r2: FeatsReporter = {
    onStep: () => {
      orderLog.push("r2");
    },
  };

  Given("a step", () => {});

  const feature = parseFeature(
    `
Feature: Multi
  Scenario: only
    Given a step
`,
    "events-6.feature",
  );

  runFeatures([feature], { reporters: [r1, r2] });

  describe("reporter event — multiple reporters", () => {
    test("each reporter receives the event, in registration order", () => {
      expect(orderLog).toEqual(["r1", "r2"]);
    });
  });
}

// ---- Test 7: async reporter callbacks are awaited ----
{
  clearRegistry();
  clearHooks();

  const order: string[] = [];
  const asyncReporter: FeatsReporter = {
    onStep: async () => {
      order.push("before-await");
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("after-await");
    },
  };

  Given("first step", () => {
    order.push("first-step");
  });
  Given("second step", () => {
    order.push("second-step");
  });

  const feature = parseFeature(
    `
Feature: Async
  Scenario: only
    Given first step
    Given second step
`,
    "events-7.feature",
  );

  runFeatures([feature], { reporters: [asyncReporter] });

  describe("reporter event — async callbacks", () => {
    test("runFeatures awaits each onStep before proceeding to the next step", () => {
      // Expected: first-step → before-await → after-await → second-step → before-await → after-await
      expect(order).toEqual([
        "first-step",
        "before-await",
        "after-await",
        "second-step",
        "before-await",
        "after-await",
      ]);
    });
  });
}

// Test 8 (raw error preservation) lives in the failures suite — the inner
// scenario is meant to fail, which would otherwise pollute this file.
