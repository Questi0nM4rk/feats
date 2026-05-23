// tests/bench/synthetic.test.ts
//
// Unit tests for bench/synthetic.ts — verifies that generateSyntheticFeature
// produces the expected Feature structure. The bench harness depends on this
// function returning a non-empty Feature; these tests pin that contract.
//
// (Cherry-picked from CodeRabbit PR #5 with the non-null-assertion fix.)

import { describe, expect, test } from "bun:test";
import { generateSyntheticFeature } from "../../bench/synthetic";

describe("generateSyntheticFeature", () => {
  test("plain scenarios + 10 outline examples = total scenario count", () => {
    // The function generates `scenarioCount` plain Scenarios plus 10 outline
    // examples (the fixed Outline computation block). Total = scenarioCount + 10.
    const feature = generateSyntheticFeature(5);
    expect(feature.scenarios).toHaveLength(15);
  });

  test("feature name is 'Synthetic perf bench'", () => {
    const feature = generateSyntheticFeature(1);
    expect(feature.name).toBe("Synthetic perf bench");
  });

  test("has a background with a single 'counter is 0' step", () => {
    const feature = generateSyntheticFeature(1);
    expect(feature.background).toBeDefined();
    expect(feature.background?.steps).toHaveLength(1);
    const bgStep = feature.background?.steps[0];
    expect(bgStep?.keyword).toBe("Given");
    expect(bgStep?.text).toBe("counter is 0");
  });

  test("uri is 'bench/synthetic.feature'", () => {
    const feature = generateSyntheticFeature(1);
    expect(feature.uri).toBe("bench/synthetic.feature");
  });

  test("plain scenarios are named 'Scenario N' starting from 0", () => {
    const feature = generateSyntheticFeature(3);
    // Outline examples come after plain scenarios in the source.
    const plainNames = feature.scenarios.slice(0, 3).map((s) => s.name);
    expect(plainNames).toEqual(["Scenario 0", "Scenario 1", "Scenario 2"]);
  });

  test("each plain scenario has exactly 3 steps (Given/When/Then)", () => {
    const feature = generateSyntheticFeature(3);
    for (const scenario of feature.scenarios.slice(0, 3)) {
      expect(scenario.steps).toHaveLength(3);
      const [given, when, then] = scenario.steps;
      expect(given?.keyword).toBe("Given");
      expect(when?.keyword).toBe("When");
      expect(then?.keyword).toBe("Then");
    }
  });

  test("outline examples are appended after plain scenarios", () => {
    const scenarioCount = 2;
    const feature = generateSyntheticFeature(scenarioCount);
    // outline has 10 example rows
    expect(feature.scenarios).toHaveLength(scenarioCount + 10);
    const outlineScenario = feature.scenarios[scenarioCount];
    // Outline name "Outline computation" has no <placeholder>, so the
    // disambiguator appends [N] to each example. Test that the name carries
    // the base outline title.
    expect(outlineScenario?.name).toMatch(/Outline computation/);
  });

  test("scenarioCount=0 produces only the 10 outline examples", () => {
    const feature = generateSyntheticFeature(0);
    expect(feature.scenarios).toHaveLength(10);
    // All should be outline examples — each carries the outline's 3 steps.
    for (const s of feature.scenarios) {
      expect(s.steps).toHaveLength(3);
    }
  });

  test("large scenarioCount produces correct total scenario count", () => {
    const feature = generateSyntheticFeature(100);
    // 100 plain scenarios + 10 outline examples
    expect(feature.scenarios).toHaveLength(110);
  });

  test("outline examples carry substituted step text from the example table", () => {
    const feature = generateSyntheticFeature(0);
    // First example row: a=1, b=2, c=3.
    const first = feature.scenarios[0];
    if (first === undefined) throw new Error("expected at least one scenario");
    const stepTexts = first.steps.map((s) => s.text);
    expect(stepTexts[0]).toBe("counter is 1");
    expect(stepTexts[1]).toBe("increment by 2");
    expect(stepTexts[2]).toBe("counter equals 3");
  });

  test("feature has no tags", () => {
    const feature = generateSyntheticFeature(1);
    expect(feature.tags).toHaveLength(0);
  });
});
