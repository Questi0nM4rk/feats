// tests/runner/run-scenario-pure.test.ts
//
// Unit tests for runScenarioPure — the new extracted, bun:test-free
// per-scenario engine (Phase 2c). Tests focus on the function's contract:
// it returns a ScenarioOutcome, never throws on step/hook failures, and
// emits the full reporter event pair.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, getRegistry, Given, When } from "@/registry/step-registry";
import type { FeatsReporter } from "@/reporting/reporter";
import { runScenarioPure } from "@/runner/feature-runner";
import {
  After,
  Before,
  clearHooks,
  getAfterHooks,
  getBeforeHooks,
} from "@/runner/hook-runner";
import { pending } from "@/runner/pending";

// Helpers ─────────────────────────────────────────────────────────────────────

/** Build the args object runScenarioPure expects from a parsed feature/scenario. */
function makeArgs(
  featureSrc: string,
  scenarioIndex = 0,
  reporters: FeatsReporter[] = [],
) {
  const feature = parseFeature(featureSrc, "test.feature");
  const scenario = feature.scenarios[scenarioIndex];
  if (scenario === undefined) throw new Error("No scenario at index " + scenarioIndex);
  const scenarioTags = [...feature.tags, ...(scenario.rule?.tags ?? []), ...scenario.tags];
  const definitions = [...getRegistry().getAll()];
  const beforeHooks = [...getBeforeHooks()];
  const afterHooks = [...getAfterHooks()];
  return {
    scenario,
    feature,
    scenarioTags,
    definitions,
    beforeHooks,
    afterHooks,
    worldFactory: () => ({}),
    reporters,
  };
}

// Setup / teardown ─────────────────────────────────────────────────────────────

beforeEach(() => {
  clearRegistry();
  clearHooks();
});
afterEach(() => {
  clearRegistry();
  clearHooks();
});

// Tests ────────────────────────────────────────────────────────────────────────

describe("runScenarioPure — passing scenario", () => {
  test("returns result.status='passed' and no stepError", async () => {
    Given("a passing step", () => {});

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given a passing step
`);
    const outcome = await runScenarioPure(args);

    expect(outcome.result.status).toBe("passed");
    expect(outcome.stepError).toBeUndefined();
    expect(outcome.afterErrors).toEqual([]);
    expect(outcome.firstFailedStep).toBeUndefined();
  });

  test("result.durationMs is a non-negative number", async () => {
    Given("quick step", () => {});

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given quick step
`);
    const outcome = await runScenarioPure(args);

    expect(typeof outcome.result.durationMs).toBe("number");
    expect(outcome.result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("result.steps contains one entry per step", async () => {
    Given("step one", () => {});
    When("step two", () => {});

    const args = makeArgs(`
Feature: F
  Scenario: multi
    Given step one
    When step two
`);
    const outcome = await runScenarioPure(args);

    expect(outcome.result.steps).toHaveLength(2);
    expect(outcome.result.steps[0]?.status).toBe("passed");
    expect(outcome.result.steps[1]?.status).toBe("passed");
  });
});

describe("runScenarioPure — failing scenario", () => {
  test("does NOT throw on step failure — returns outcome instead", async () => {
    Given("a boom step", () => {
      throw new Error("BOOM");
    });

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given a boom step
`);

    // The key contract: runScenarioPure must not throw.
    let outcome: Awaited<ReturnType<typeof runScenarioPure>> | undefined;
    await expect(
      (async () => {
        outcome = await runScenarioPure(args);
      })(),
    ).resolves.toBeUndefined();

    expect(outcome?.result.status).toBe("failed");
    expect(outcome?.stepError).toBeInstanceOf(Error);
    expect((outcome?.stepError as Error).message).toBe("BOOM");
  });

  test("firstFailedStep points to the step that threw", async () => {
    Given("step ok", () => {});
    Given("step bad", () => {
      throw new Error("bad");
    });
    Given("step skipped", () => {});

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given step ok
    Given step bad
    Given step skipped
`);
    const outcome = await runScenarioPure(args);

    expect(outcome.result.status).toBe("failed");
    expect(outcome.firstFailedStep?.text).toBe("step bad");
    // The step after the failure should be skipped.
    expect(outcome.result.steps[2]?.status).toBe("skipped");
  });

  test("undefined step produces result.status='undefined'", async () => {
    // Register nothing — step has no definition.
    const args = makeArgs(`
Feature: F
  Scenario: s
    Given there is no definition for this
`);
    const outcome = await runScenarioPure(args);

    expect(outcome.result.status).toBe("undefined");
  });

  test("pending step produces result.status='pending'", async () => {
    Given("a pending step", () => {
      pending("not implemented");
    });

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given a pending step
`);
    const outcome = await runScenarioPure(args);

    expect(outcome.result.status).toBe("pending");
    // pending is not a hard failure — stepError is set but it is a PendingError
    expect(outcome.result.status).not.toBe("failed");
  });
});

describe("runScenarioPure — Before/After hook interactions", () => {
  test("Before hook error surfaces as stepError and marks scenario failed", async () => {
    Before(() => {
      throw new Error("before boom");
    });
    Given("never reached", () => {});

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given never reached
`);
    const outcome = await runScenarioPure(args);

    expect(outcome.result.status).toBe("failed");
    expect(outcome.stepError).toBeInstanceOf(Error);
    expect((outcome.stepError as Error).message).toBe("before boom");
    // No steps ran — the before hook blew up before runStepsCapturing.
    expect(outcome.result.steps).toHaveLength(0);
  });

  test("After hook error is collected in afterErrors and marks scenario failed", async () => {
    After(() => {
      throw new Error("after boom");
    });
    Given("normal step", () => {});

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given normal step
`);
    const outcome = await runScenarioPure(args);

    expect(outcome.afterErrors).toHaveLength(1);
    expect((outcome.afterErrors[0] as Error).message).toBe("after boom");
    expect(outcome.result.status).toBe("failed");
  });

  test("After hook always runs even when a step failed", async () => {
    const trace: string[] = [];
    Given("step that fails", () => {
      trace.push("step");
      throw new Error("step fail");
    });
    After(() => {
      trace.push("after");
    });

    const args = makeArgs(`
Feature: F
  Scenario: s
    Given step that fails
`);
    await runScenarioPure(args);

    expect(trace).toContain("after");
  });
});

describe("runScenarioPure — reporter events", () => {
  test("emits onScenarioStart then onScenarioEnd in order", async () => {
    const events: string[] = [];
    const reporter: FeatsReporter = {
      onScenarioStart: (s) => {
        events.push(`start:${s.name}`);
      },
      onScenarioEnd: (r) => {
        events.push(`end:${r.status}`);
      },
    };

    Given("reported step", () => {});

    const args = makeArgs(
      `
Feature: F
  Scenario: reported
    Given reported step
`,
      0,
      [reporter],
    );
    await runScenarioPure(args);

    expect(events).toEqual(["start:reported", "end:passed"]);
  });

  test("onScenarioEnd receives the correct scenario result reference", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: type captured at runtime
    let capturedResult: any;

    const reporter: FeatsReporter = {
      onScenarioEnd: (r) => {
        capturedResult = r;
      },
    };

    Given("step x", () => {});
    const args = makeArgs(
      `
Feature: F
  Scenario: x
    Given step x
`,
      0,
      [reporter],
    );
    const outcome = await runScenarioPure(args);

    // The emitted result must be the same object as outcome.result.
    expect(capturedResult).toBe(outcome.result);
  });
});
