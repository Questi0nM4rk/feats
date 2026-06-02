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

  test("tagFilter='' runs all scenarios", async () => {
    const ran: string[] = [];
    Given("step one", () => {
      ran.push("one");
    });
    Given("step two", () => {
      ran.push("two");
    });

    const feature = parseFeature(
      `
Feature: F
  @tag1
  Scenario: A
    Given step one
  @tag2
  Scenario: B
    Given step two
`,
      "f.feature",
    );

    await runCore([feature], { tagFilter: "" });
    expect(ran).toEqual(["one", "two"]);
  });
});

describe("runCore — empty features array", () => {
  test("empty array → summary with zero counts, exitCode=0", async () => {
    const { summary, exitCode } = await runCore([]);
    expect(summary.features).toBe(0);
    expect(summary.scenarios).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(exitCode).toBe(0);
  });

  test("empty array still calls onRunStart and onRunEnd with correct args", async () => {
    const events: string[] = [];
    const reporter: FeatsReporter = {
      onRunStart: () => {
        events.push("runStart");
      },
      onRunEnd: (s) => {
        events.push(`runEnd:${s.scenarios}`);
      },
    };
    await runCore([], { reporters: [reporter] });
    expect(events).toEqual(["runStart", "runEnd:0"]);
  });
});

describe("runCore — multiple features", () => {
  test("scenarios across multiple features are counted correctly", async () => {
    Given("feature 1 step", () => {});
    Given("feature 2 step", () => {});

    const f1 = parseFeature(
      `
Feature: Feature1
  Scenario: s1
    Given feature 1 step
`,
      "f1.feature",
    );
    const f2 = parseFeature(
      `
Feature: Feature2
  Scenario: s2
    Given feature 2 step
`,
      "f2.feature",
    );

    const { summary, exitCode } = await runCore([f1, f2]);
    expect(summary.features).toBe(2);
    expect(summary.scenarios).toBe(2);
    expect(summary.passed).toBe(2);
    expect(exitCode).toBe(0);
  });
});

describe("runCore — worldFactory option", () => {
  test("worldFactory is called per scenario and world is passed to steps", async () => {
    const worlds: unknown[] = [];
    Given("capture world step", (world: unknown) => {
      worlds.push(world);
    });

    const feature = parseFeature(
      `
Feature: F
  Scenario: s1
    Given capture world step
  Scenario: s2
    Given capture world step
`,
      "f.feature",
    );

    const sentinel = { id: "custom-world" };
    await runCore([feature], { worldFactory: () => sentinel });
    expect(worlds).toHaveLength(2);
    expect(worlds[0]).toBe(sentinel);
    expect(worlds[1]).toBe(sentinel);
  });
});

describe("runCore — AfterAll error handling", () => {
  test("AfterAll throwing does not propagate — result still returned", async () => {
    AfterAll(() => {
      throw new Error("afterAll boom");
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

    // runCore must not throw even when AfterAll throws
    const { summary, exitCode } = await runCore([feature]);
    expect(summary.passed).toBe(1);
    expect(exitCode).toBe(0);
  });
});

describe("runCore — BeforeAll error propagation", () => {
  test("BeforeAll throwing propagates out of runCore", async () => {
    BeforeAll(() => {
      throw new Error("beforeAll boom");
    });

    Given("a step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given a step
`,
      "f.feature",
    );

    await expect(runCore([feature])).rejects.toThrow("beforeAll boom");
  });
});

describe("runCore — summary durationMs", () => {
  test("durationMs is a non-negative number", async () => {
    Given("quick step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given quick step
`,
      "f.feature",
    );
    const { summary } = await runCore([feature]);
    expect(typeof summary.durationMs).toBe("number");
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("runCore — mixed statuses", () => {
  test("mixed pass/fail/undefined results in summary counts", async () => {
    Given("passes", () => {});
    Given("fails", () => {
      throw new Error("fail");
    });
    // No step for "undefined step"

    const feature = parseFeature(
      `
Feature: F
  Scenario: passing
    Given passes
  Scenario: failing
    Given fails
  Scenario: undefined
    Given there is no definition for this
`,
      "f.feature",
    );

    const { summary, exitCode } = await runCore([feature]);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.undefinedSteps).toBe(1);
    expect(exitCode).toBe(1);
  });
});
