// tests/reporting/reporters/pretty.test.ts
//
// Only the passing-scenario block exercises the runFeatures integration
// end-to-end. Failure / skip / undefined paths are driven by calling
// reporter methods directly with synthetic events — the runFeatures →
// reporter event contract is already covered by tests/reporting/reporter-events.test.ts
// and reporter-events-failures.test.ts.

import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import type { Feature, ParsedStep, Scenario } from "@/parser/models";
import { clearRegistry, Given } from "@/registry/step-registry";
import type { ScenarioResult, StepResult } from "@/reporting/reporter";
import { PrettyReporter } from "@/reporting/reporters/pretty";
import { runFeatures } from "@/runner/feature-runner";
import { clearHooks } from "@/runner/hook-runner";

function captureOutput(): { lines: string[]; reporter: PrettyReporter } {
  const lines: string[] = [];
  const reporter = new PrettyReporter({
    write: (chunk) => {
      lines.push(chunk);
    },
  });
  return { lines, reporter };
}

function makeStep(text: string, line = 1, keyword: ParsedStep["keyword"] = "Given"): ParsedStep {
  return {
    keyword,
    text,
    dataTable: undefined,
    docString: undefined,
    location: { uri: "test.feature", line },
  };
}

function makeFeature(name: string): Feature {
  return {
    name,
    description: "",
    tags: [],
    background: undefined,
    scenarios: [],
    uri: "test.feature",
  };
}

function makeScenario(name: string): Scenario {
  return { name, tags: [], steps: [] };
}

// ---- 1: end-to-end through runFeatures (the only block that uses bun:test) ----
{
  clearRegistry();
  clearHooks();
  const { lines, reporter } = captureOutput();

  Given("a passing step", () => {});

  const feature = parseFeature(
    `
Feature: Cart
  Scenario: empty
    Given a passing step
`,
    "cart.feature",
  );

  runFeatures([feature], { reporters: [reporter] });

  describe("PrettyReporter — end-to-end with runFeatures (passing scenario)", () => {
    test("output includes Feature, Scenario, step, summary", () => {
      const all = lines.join("");
      expect(all).toContain("Feature: Cart");
      expect(all).toContain("Scenario: empty");
      expect(all).toContain("Given a passing step");
      expect(all).toContain("✓");
      expect(all).toContain("1 passed");
    });
  });
}

// ---- 2: direct invocation — failure rendering ----
describe("PrettyReporter — failure rendering (direct invocation)", () => {
  test("failed step shows ✗ and original error in Failures section", () => {
    const { lines, reporter } = captureOutput();
    const feature = makeFeature("F");
    const scenario = makeScenario("failing scenario");
    const step = makeStep("a step that throws");

    reporter.onFeatureStart?.(feature);
    reporter.onScenarioStart?.(scenario, feature);
    const stepResult: StepResult = {
      step,
      status: "failed",
      durationMs: 3.2,
      error: new Error("UNIQUE_FAILURE_MESSAGE"),
    };
    reporter.onStep?.(stepResult);
    const scenarioResult: ScenarioResult = {
      scenario,
      feature,
      status: "failed",
      steps: [stepResult],
      durationMs: 3.2,
      error: new Error("UNIQUE_FAILURE_MESSAGE"),
    };
    reporter.onScenarioEnd?.(scenarioResult);
    reporter.onRunEnd?.({
      features: 1,
      scenarios: 1,
      passed: 0,
      failed: 1,
      pending: 0,
      skipped: 0,
      undefinedSteps: 0,
      durationMs: 3.2,
    });

    const all = lines.join("");
    expect(all).toContain("✗");
    expect(all).toContain("UNIQUE_FAILURE_MESSAGE");
    expect(all).toContain("Failures:");
    expect(all).toContain("F > failing scenario");
    expect(all).toContain("1 failed");
  });
});

// ---- 3: direct invocation — skipped step rendering ----
describe("PrettyReporter — skipped step rendering", () => {
  test("skipped step shows − (dash) icon, no duration", () => {
    const { lines, reporter } = captureOutput();
    const step = makeStep("a never-executed step", 7, "When");
    const stepResult: StepResult = {
      step,
      status: "skipped",
      durationMs: 0,
    };
    reporter.onStep?.(stepResult);

    const all = lines.join("");
    expect(all).toContain("− When a never-executed step");
    // No "(N ms)" — skipped steps have no duration displayed.
    expect(all).not.toMatch(/\([\d.]+ ms\)/);
  });
});

// ---- 4: direct invocation — undefined step renders snippet ----
describe("PrettyReporter — undefined step rendering", () => {
  test("undefined step renders ? icon + uri:line + snippet from the error", () => {
    const { lines, reporter } = captureOutput();
    const step = makeStep("there is no step definition", 12);
    const undefinedError = new Error(
      `Undefined step at test.feature:12: "there is no step definition"\n\nAdd a step definition:\n\nGiven("there is no step definition", async (world) => {\n  // TODO: implement\n  throw new Error("Not implemented");\n});`,
    );
    reporter.onStep?.({
      step,
      status: "undefined",
      durationMs: 0.1,
      error: undefinedError,
    });

    const all = lines.join("");
    expect(all).toContain("?");
    expect(all).toContain("test.feature:12");
    expect(all).toContain('Given("there is no step definition"');
  });
});

// ---- 5: direct invocation — summary line variants ----
describe("PrettyReporter — summary line", () => {
  test("singular vs plural noun forms", () => {
    const { lines, reporter } = captureOutput();
    reporter.onRunEnd?.({
      features: 1,
      scenarios: 1,
      passed: 1,
      failed: 0,
      pending: 0,
      skipped: 0,
      undefinedSteps: 0,
      durationMs: 12.5,
    });
    const all = lines.join("");
    expect(all).toContain("1 feature, 1 scenario");
    expect(all).not.toContain("scenarios"); // singular form for 1
  });

  test("plural form for >1", () => {
    const { lines, reporter } = captureOutput();
    reporter.onRunEnd?.({
      features: 3,
      scenarios: 7,
      passed: 5,
      failed: 1,
      pending: 1,
      skipped: 0,
      undefinedSteps: 0,
      durationMs: 150,
    });
    const all = lines.join("");
    expect(all).toContain("3 features, 7 scenarios");
    expect(all).toContain("5 passed");
    expect(all).toContain("1 failed");
    expect(all).toContain("1 pending");
  });

  test("duration formats: <1ms shows 2 decimal places", () => {
    const { lines, reporter } = captureOutput();
    reporter.onRunEnd?.({
      features: 1,
      scenarios: 1,
      passed: 1,
      failed: 0,
      pending: 0,
      skipped: 0,
      undefinedSteps: 0,
      durationMs: 0.42,
    });
    expect(lines.join("")).toContain("0.42 ms");
  });

  test("duration formats: >1s shows seconds with 2 decimals", () => {
    const { lines, reporter } = captureOutput();
    reporter.onRunEnd?.({
      features: 1,
      scenarios: 1,
      passed: 1,
      failed: 0,
      pending: 0,
      skipped: 0,
      undefinedSteps: 0,
      durationMs: 1234.5,
    });
    expect(lines.join("")).toContain("1.23 s");
  });
});
