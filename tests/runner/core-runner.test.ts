// tests/runner/core-runner.test.ts
//
// Black-box tests for runCore — the bun:test-free runner that powers the
// `feats` CLI. Uses real Given/When/Then registrations, real reporters,
// and asserts on the structured RunResult.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, Given } from "@/registry/step-registry";
import type { FeatsReporter } from "@/reporting/reporter";
import { runCore } from "@/runner/core-runner";
import { AfterAll, BeforeAll, clearHooks } from "@/runner/hook-runner";
import { pending } from "@/runner/pending";

beforeEach(() => {
  clearRegistry();
  clearHooks();
});
afterEach(() => {
  clearRegistry();
  clearHooks();
});

describe("runCore — returns structured summary, never throws on scenario failure", () => {
  test("all passing — summary.passed=N, exitCode=0", async () => {
    Given("step A", () => {});
    Given("step B", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s1
    Given step A
  Scenario: s2
    Given step B
`,
      "f.feature",
    );

    const { summary, exitCode } = await runCore([feature]);

    expect(summary.scenarios).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(exitCode).toBe(0);
  });

  test("failing scenario — summary.failed=1, exitCode=1, no throw", async () => {
    Given("a failing step", () => {
      throw new Error("BOOM");
    });
    const feature = parseFeature(
      `
Feature: F
  Scenario: failing
    Given a failing step
`,
      "f.feature",
    );

    // Must not throw — caller decides what to do with exitCode.
    const { summary, exitCode } = await runCore([feature]);
    expect(summary.failed).toBe(1);
    expect(exitCode).toBe(1);
  });

  test("undefined step — exitCode=1, undefinedSteps=1", async () => {
    const feature = parseFeature(
      `
Feature: F
  Scenario: missing
    Given there is no step
`,
      "f.feature",
    );
    const { summary, exitCode } = await runCore([feature]);
    expect(summary.undefinedSteps).toBe(1);
    expect(exitCode).toBe(1);
  });

  test("pending scenario — exitCode=0 (pending is non-failure)", async () => {
    Given("pending step", () => {
      pending("not done");
    });
    const feature = parseFeature(
      `
Feature: F
  Scenario: p
    Given pending step
`,
      "f.feature",
    );
    const { summary, exitCode } = await runCore([feature]);
    expect(summary.pending).toBe(1);
    expect(summary.failed).toBe(0);
    expect(exitCode).toBe(0);
  });
});

describe("runCore — emits the full reporter event stream", () => {
  test("onRunStart → per-feature/scenario events → onRunEnd, in order", async () => {
    const events: string[] = [];
    const reporter: FeatsReporter = {
      onRunStart: () => {
        events.push("runStart");
      },
      onFeatureStart: (f) => {
        events.push(`featureStart:${f.name}`);
      },
      onScenarioStart: (s) => {
        events.push(`scenarioStart:${s.name}`);
      },
      onStep: (r) => {
        events.push(`step:${r.status}`);
      },
      onScenarioEnd: (r) => {
        events.push(`scenarioEnd:${r.status}`);
      },
      onFeatureEnd: (r) => {
        events.push(`featureEnd:${r.feature.name}`);
      },
      onRunEnd: () => {
        events.push("runEnd");
      },
    };

    Given("a step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given a step
`,
      "f.feature",
    );

    await runCore([feature], { reporters: [reporter] });

    expect(events).toEqual([
      "runStart",
      "featureStart:F",
      "scenarioStart:s",
      "step:passed",
      "scenarioEnd:passed",
      "featureEnd:F",
      "runEnd",
    ]);
  });
});

describe("runCore — lifecycle hooks", () => {
  test("BeforeAll fires before any onRunStart, AfterAll fires after onRunEnd", async () => {
    const order: string[] = [];
    BeforeAll(() => {
      order.push("BeforeAll");
    });
    AfterAll(() => {
      order.push("AfterAll");
    });

    const reporter: FeatsReporter = {
      onRunStart: () => {
        order.push("onRunStart");
      },
      onRunEnd: () => {
        order.push("onRunEnd");
      },
    };

    Given("a step", () => {
      order.push("step");
    });
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given a step
`,
      "f.feature",
    );

    await runCore([feature], { reporters: [reporter] });

    expect(order).toEqual(["BeforeAll", "onRunStart", "step", "onRunEnd", "AfterAll"]);
  });
});

describe("runCore — tag filtering", () => {
  test("only matching scenarios run", async () => {
    const ran: string[] = [];
    Given("the smoke step", () => {
      ran.push("smoke");
    });
    Given("the slow step", () => {
      ran.push("slow");
    });

    const feature = parseFeature(
      `
Feature: F
  @smoke
  Scenario: A
    Given the smoke step
  @slow
  Scenario: B
    Given the slow step
`,
      "f.feature",
    );

    await runCore([feature], { tagFilter: "@smoke" });
    expect(ran).toEqual(["smoke"]);
  });
});
