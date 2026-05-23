// tests/bench/synthetic.test.ts
//
// Unit tests for bench/synthetic.ts — generateSyntheticFeature().
//
// The function is the heart of the perf bench harness; tests here ensure
// the generated Feature is structurally correct so that bench timings
// reflect real parser work and aren't silently skipped.

import { describe, expect, test } from "bun:test";
import { generateSyntheticFeature } from "../../bench/synthetic";

describe("generateSyntheticFeature", () => {
  test("returns a Feature with the expected name", () => {
    const f = generateSyntheticFeature(1);
    expect(f.name).toBe("Synthetic perf bench");
  });

  test("feature has a Background with exactly one step", () => {
    const f = generateSyntheticFeature(5);
    expect(f.background).toBeDefined();
    expect(f.background?.steps).toHaveLength(1);
    const bg = f.background?.steps[0];
    expect(bg?.keyword).toBe("Given");
    expect(bg?.text).toBe("counter is 0");
  });

  test("scenarioCount=100 yields 110 scenarios (100 plain + 10 outline examples)", () => {
    const f = generateSyntheticFeature(100);
    // 100 plain scenarios + 10 example rows in the Scenario Outline
    expect(f.scenarios).toHaveLength(110);
  });

  test("scenarioCount=0 yields 10 scenarios (outline examples only)", () => {
    const f = generateSyntheticFeature(0);
    // Only the Scenario Outline's 10 example rows remain
    expect(f.scenarios).toHaveLength(10);
  });

  test("scenarioCount=1 yields 11 scenarios", () => {
    const f = generateSyntheticFeature(1);
    expect(f.scenarios).toHaveLength(11);
  });

  test("plain scenarios are named 'Scenario N' for N from 0", () => {
    const f = generateSyntheticFeature(3);
    // First 3 scenarios are plain; last 10 are from the outline
    const plainNames = f.scenarios.slice(0, 3).map((s) => s.name);
    expect(plainNames).toEqual(["Scenario 0", "Scenario 1", "Scenario 2"]);
  });

  test("each plain scenario has exactly 3 steps (Given / When / Then)", () => {
    const f = generateSyntheticFeature(5);
    for (const scenario of f.scenarios.slice(0, 5)) {
      expect(scenario.steps).toHaveLength(3);
      expect(scenario.steps[0]?.keyword).toBe("Given");
      expect(scenario.steps[1]?.keyword).toBe("When");
      expect(scenario.steps[2]?.keyword).toBe("Then");
    }
  });

  test("outline scenarios receive [N] suffix because name has no placeholder", () => {
    const f = generateSyntheticFeature(0);
    // All 10 outline rows should be named "Outline computation [1]" … "[10]"
    const outlineNames = f.scenarios.map((s) => s.name);
    expect(outlineNames).toEqual([
      "Outline computation [1]",
      "Outline computation [2]",
      "Outline computation [3]",
      "Outline computation [4]",
      "Outline computation [5]",
      "Outline computation [6]",
      "Outline computation [7]",
      "Outline computation [8]",
      "Outline computation [9]",
      "Outline computation [10]",
    ]);
  });

  test("outline scenarios have 3 steps each", () => {
    const f = generateSyntheticFeature(0);
    for (const s of f.scenarios) {
      expect(s.steps).toHaveLength(3);
    }
  });

  test("outline step texts have placeholder values substituted (not raw angle-bracket text)", () => {
    const f = generateSyntheticFeature(0);
    const firstOutline = f.scenarios[0];
    expect(firstOutline).toBeDefined();
    // First row: a=1, b=2, c=3
    const stepTexts = firstOutline!.steps.map((s) => s.text);
    expect(stepTexts[0]).toBe("counter is 1");
    expect(stepTexts[1]).toBe("increment by 2");
    expect(stepTexts[2]).toBe("counter equals 3");
    // Raw placeholders should not appear in any compiled step text
    for (const s of f.scenarios) {
      for (const step of s.steps) {
        expect(step.text).not.toMatch(/<[abc]>/);
      }
    }
  });

  test("uri is set to 'bench/synthetic.feature' on all scenarios' step locations", () => {
    const f = generateSyntheticFeature(2);
    for (const scenario of f.scenarios) {
      for (const step of scenario.steps) {
        expect(step.location.uri).toBe("bench/synthetic.feature");
      }
    }
  });

  test("scenarios have no tags (bench feature is untagged)", () => {
    const f = generateSyntheticFeature(5);
    for (const scenario of f.scenarios) {
      expect(scenario.tags).toHaveLength(0);
    }
    expect(f.tags).toHaveLength(0);
  });

  test("produces non-zero scenarios — bench guard does not throw", () => {
    // The bench script throws if feature.scenarios.length === 0.
    // generateSyntheticFeature always produces at least the 10 outline rows.
    const f = generateSyntheticFeature(0);
    expect(f.scenarios.length).toBeGreaterThan(0);
  });
});