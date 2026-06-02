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

describe("runCore — empty features array", () => {
  test("returns exitCode=0 and all-zero summary when no features are given", async () => {
    const { summary, exitCode } = await runCore([]);
    expect(exitCode).toBe(0);
    expect(summary.features).toBe(0);
    expect(summary.scenarios).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.undefinedSteps).toBe(0);
  });
});

describe("runCore — multiple features", () => {
  test("summary.features equals the number of Feature blocks provided", async () => {
    Given("feature one step", () => {});
    Given("feature two step", () => {});

    const featureA = parseFeature(
      `
Feature: A
  Scenario: a1
    Given feature one step
`,
      "a.feature",
    );
    const featureB = parseFeature(
      `
Feature: B
  Scenario: b1
    Given feature two step
`,
      "b.feature",
    );

    const { summary, exitCode } = await runCore([featureA, featureB]);
    expect(summary.features).toBe(2);
    expect(summary.scenarios).toBe(2);
    expect(summary.passed).toBe(2);
    expect(exitCode).toBe(0);
  });

  test("mixed results across features → exitCode=1, failed count sums correctly", async () => {
    Given("a good step", () => {});
    Given("a bad step", () => {
      throw new Error("bad");
    });

    const pass = parseFeature(
      `
Feature: Passing
  Scenario: ok
    Given a good step
`,
      "pass.feature",
    );
    const fail = parseFeature(
      `
Feature: Failing
  Scenario: no
    Given a bad step
`,
      "fail.feature",
    );

    const { summary, exitCode } = await runCore([pass, fail]);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(exitCode).toBe(1);
  });
});

describe("runCore — AfterAll errors are swallowed", () => {
  test("AfterAll that throws does not propagate — run still completes and returns result", async () => {
    AfterAll(() => {
      throw new Error("teardown exploded");
    });
    Given("a passing step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given a passing step
`,
      "f.feature",
    );

    // Must not throw even though AfterAll throws.
    const { summary, exitCode } = await runCore([feature]);
    expect(summary.passed).toBe(1);
    // exitCode is based on scenario results only, not AfterAll errors.
    expect(exitCode).toBe(0);
  });
});

describe("runCore — worldFactory option", () => {
  test("custom worldFactory value is available to step callbacks", async () => {
    const seenValues: unknown[] = [];
    Given("step reads world", (world: Record<string, unknown>) => {
      seenValues.push(world.token);
    });
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given step reads world
`,
      "f.feature",
    );

    await runCore([feature], {
      worldFactory: () => ({ token: "custom-value" }),
    });

    expect(seenValues).toEqual(["custom-value"]);
  });
});

describe("runCore — summary shape", () => {
  test("durationMs is a non-negative number", async () => {
    Given("a timed step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given a timed step
`,
      "f.feature",
    );

    const { summary } = await runCore([feature]);
    expect(typeof summary.durationMs).toBe("number");
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("runCore — feature tag inheritance", () => {
  test("feature-level tag is inherited by all scenarios for tag filtering", async () => {
    const ran: string[] = [];
    Given("feature tagged step", () => {
      ran.push("ran");
    });

    // @feature-tag is on the Feature, not on any Scenario.
    const feature = parseFeature(
      `
@feature-tag
Feature: F
  Scenario: s
    Given feature tagged step
`,
      "f.feature",
    );

    await runCore([feature], { tagFilter: "@feature-tag" });
    expect(ran).toEqual(["ran"]);
  });

  test("scenario excluded by feature tag filter does not run", async () => {
    const ran: string[] = [];
    Given("should not run step", () => {
      ran.push("ran");
    });

    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given should not run step
`,
      "f.feature",
    );

    // Feature has no @smoke tag, scenario has none either — filtered out.
    await runCore([feature], { tagFilter: "@smoke" });
    expect(ran).toEqual([]);
  });
});

describe("runCore — reporters option", () => {
  test("empty reporters array is accepted without error", async () => {
    Given("noop step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given noop step
`,
      "f.feature",
    );

    await expect(runCore([feature], { reporters: [] })).resolves.toBeDefined();
  });

  test("multiple reporters all receive onRunEnd", async () => {
    const ended: number[] = [];
    const r1: import("@/reporting/reporter").FeatsReporter = {
      onRunEnd: () => { ended.push(1); },
    };
    const r2: import("@/reporting/reporter").FeatsReporter = {
      onRunEnd: () => { ended.push(2); },
    };

    Given("multi-reporter step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given multi-reporter step
`,
      "f.feature",
    );

    await runCore([feature], { reporters: [r1, r2] });
    expect(ended).toEqual([1, 2]);
  });
});
