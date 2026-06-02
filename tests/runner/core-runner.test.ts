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

  test("feature-level tags are inherited by all scenarios in the feature", async () => {
    const ran: string[] = [];
    Given("feature-tagged step", () => {
      ran.push("feature-tagged");
    });

    // @feature-tag is on the Feature: line — it should be inherited by
    // every scenario in the feature, making the tag filter match all of them.
    const feature = parseFeature(
      `
@feature-tag
Feature: F
  Scenario: inherits feature tag
    Given feature-tagged step
`,
      "f.feature",
    );

    await runCore([feature], { tagFilter: "@feature-tag" });
    expect(ran).toEqual(["feature-tagged"]);
  });
});

describe("runCore — empty and multi-feature inputs", () => {
  test("empty features array returns zero-count summary and exitCode=0", async () => {
    const { summary, exitCode } = await runCore([]);
    expect(summary.features).toBe(0);
    expect(summary.scenarios).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(exitCode).toBe(0);
  });

  test("summary.features reflects the number of features processed", async () => {
    Given("step one", () => {});
    Given("step two", () => {});

    const f1 = parseFeature(
      `
Feature: First
  Scenario: s1
    Given step one
`,
      "f1.feature",
    );
    const f2 = parseFeature(
      `
Feature: Second
  Scenario: s2
    Given step two
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

describe("runCore — summary fields", () => {
  test("durationMs is a non-negative number", async () => {
    Given("timed step", () => {});
    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given timed step
`,
      "f.feature",
    );

    const { summary } = await runCore([feature]);
    expect(typeof summary.durationMs).toBe("number");
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("scenario with a failing step counts as 'failed', not 'skipped'", async () => {
    Given("first failing step", () => {
      throw new Error("first");
    });
    Given("should be skipped", () => {});

    const feature = parseFeature(
      `
Feature: F
  Scenario: has skips
    Given first failing step
    Given should be skipped
`,
      "f.feature",
    );

    const { summary } = await runCore([feature]);
    // The scenario itself is "failed" — summary counts reflect scenario statuses.
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(0);
  });
});

describe("runCore — AfterAll error handling", () => {
  test("AfterAll that throws does not propagate — run still returns a result", async () => {
    AfterAll(() => {
      throw new Error("afterall boom");
    });
    Given("safe step", () => {});

    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given safe step
`,
      "f.feature",
    );

    // Must not throw despite AfterAll error.
    const { summary, exitCode } = await runCore([feature]);
    expect(summary.passed).toBe(1);
    expect(exitCode).toBe(0);
  });
});

describe("runCore — worldFactory option", () => {
  test("custom worldFactory provides world to step callbacks", async () => {
    interface TestWorld {
      value: number;
    }

    Given("reads from world", (world: TestWorld) => {
      // The custom factory sets value=42; assert it here.
      expect(world.value).toBe(42);
    });

    const feature = parseFeature(
      `
Feature: F
  Scenario: s
    Given reads from world
`,
      "f.feature",
    );

    const { summary, exitCode } = await runCore([feature], {
      worldFactory: () => ({ value: 42 }),
    });
    expect(summary.passed).toBe(1);
    expect(exitCode).toBe(0);
  });
});

describe("runCore — multiple reporters", () => {
  test("all reporters receive the same events", async () => {
    const events1: string[] = [];
    const events2: string[] = [];

    const reporter1: FeatsReporter = {
      onRunStart: () => {
        events1.push("runStart");
      },
      onRunEnd: () => {
        events1.push("runEnd");
      },
    };
    const reporter2: FeatsReporter = {
      onRunStart: () => {
        events2.push("runStart");
      },
      onRunEnd: () => {
        events2.push("runEnd");
      },
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

    await runCore([feature], { reporters: [reporter1, reporter2] });

    expect(events1).toEqual(["runStart", "runEnd"]);
    expect(events2).toEqual(["runStart", "runEnd"]);
  });
});
