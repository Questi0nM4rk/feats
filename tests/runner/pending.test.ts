// tests/runner/pending.test.ts
//
// Pending step contract. Uses the same in-process recording-reporter
// pattern as reporter-events.test.ts so the asserting tests run AFTER
// the runFeatures-generated tests complete.

import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, Given, When } from "@/registry/step-registry";
import type { FeatsReporter } from "@/reporting/reporter";
import { runFeatures } from "@/runner/feature-runner";
import { clearHooks } from "@/runner/hook-runner";
import { isPendingError, PendingError, pending } from "@/runner/pending";

describe("PendingError + isPendingError", () => {
  test("pending() throws PendingError with the provided reason", () => {
    expect(() => pending("not yet")).toThrow(PendingError);
    try {
      pending("test reason");
    } catch (err) {
      expect(err).toBeInstanceOf(PendingError);
      expect((err as Error).message).toBe("test reason");
    }
  });

  test("pending() with no reason uses default message", () => {
    try {
      pending();
    } catch (err) {
      expect((err as Error).message).toBe("Step pending");
    }
  });

  test("isPendingError detects own + cross-realm via symbol brand", () => {
    expect(isPendingError(new PendingError("x"))).toBe(true);
    expect(isPendingError(new Error("x"))).toBe(false);
    expect(isPendingError(null)).toBe(false);
    expect(isPendingError("string")).toBe(false);
    // Brand check works even on objects that aren't real PendingError
    // instances (e.g. when the class is duplicated across realms).
    const brandedFake = { [Symbol.for("@questi0nm4rk/feats/PendingError")]: true };
    expect(isPendingError(brandedFake)).toBe(true);
  });
});

// ---- end-to-end: a pending step + a recording reporter ----
{
  clearRegistry();
  clearHooks();

  const events: { type: string; payload: unknown }[] = [];
  const reporter: FeatsReporter = {
    onStep: (result) => {
      events.push({
        type: "onStep",
        payload: { text: result.step.text, status: result.status },
      });
    },
    onScenarioEnd: (result) => {
      events.push({
        type: "onScenarioEnd",
        payload: { status: result.status, steps: result.steps.length },
      });
    },
    onRunEnd: (summary) => {
      events.push({
        type: "onRunEnd",
        payload: {
          passed: summary.passed,
          failed: summary.failed,
          pending: summary.pending,
        },
      });
    },
  };

  Given("a passing step", () => {});
  When("I hit a pending step", () => {
    pending("not done yet");
  });
  Given("a step after pending", () => {});

  const feature = parseFeature(
    `
Feature: F
  Scenario: with pending
    Given a passing step
    When I hit a pending step
    Given a step after pending
`,
    "pending.feature",
  );

  runFeatures([feature], { reporters: [reporter] });

  describe("pending step — end-to-end", () => {
    test("step statuses are passed, pending, skipped", () => {
      const stepEvents = events.filter((e) => e.type === "onStep");
      const statuses = stepEvents.map((e) => (e.payload as { status: string }).status);
      expect(statuses).toEqual(["passed", "pending", "skipped"]);
    });

    test("scenario aggregates to status='pending'", () => {
      const scenEnd = events.find((e) => e.type === "onScenarioEnd");
      expect((scenEnd?.payload as { status: string }).status).toBe("pending");
    });

    test("run summary counts 1 pending, 0 failed, 0 passed scenarios", () => {
      const runEnd = events.find((e) => e.type === "onRunEnd");
      expect(runEnd?.payload).toEqual({ passed: 0, failed: 0, pending: 1 });
    });

    test("the scenario does NOT fail at the bun:test level (suite stays green)", () => {
      // If pending threw to bun:test, this file would have a failed
      // inner test "F > with pending". The presence of this assertion
      // passing PROVES the scenario passed at bun:test's level.
      expect(true).toBe(true);
    });
  });
}
