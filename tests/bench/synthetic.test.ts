// synthetic.test.ts
//
// Tests for bench/synthetic.ts — generateSyntheticFeature().
//
// The function is a pure in-memory workload used by the perf bench harness.
// These tests verify it produces a well-formed Feature that matches the
// documented contract (N scenarios + 10 outline-expanded rows, one background).

import { describe, expect, test } from "bun:test";
import { generateSyntheticFeature } from "../../bench/synthetic";

const OUTLINE_ROW_COUNT = 10; // fixed in bench/synthetic.ts

describe("generateSyntheticFeature", () => {
  test("returns a Feature with the correct name", () => {
    const feature = generateSyntheticFeature(5);
    expect(feature.name).toBe("Synthetic perf bench");
  });

  test("uri is set to bench/synthetic.feature", () => {
    const feature = generateSyntheticFeature(5);
    expect(feature.uri).toBe("bench/synthetic.feature");
  });

  test("includes a background with at least one step", () => {
    const feature = generateSyntheticFeature(1);
    expect(feature.background).toBeDefined();
    expect((feature.background?.steps.length ?? 0)).toBeGreaterThan(0);
  });

  test("background step text mentions counter", () => {
    const feature = generateSyntheticFeature(1);
    const bgStep = feature.background?.steps[0];
    expect(bgStep?.text).toContain("counter");
  });

  test("produces N + OUTLINE_ROW_COUNT scenarios for N regular scenarios", () => {
    const n = 5;
    const feature = generateSyntheticFeature(n);
    expect(feature.scenarios).toHaveLength(n + OUTLINE_ROW_COUNT);
  });

  test("produces OUTLINE_ROW_COUNT scenarios when N = 0", () => {
    const feature = generateSyntheticFeature(0);
    expect(feature.scenarios).toHaveLength(OUTLINE_ROW_COUNT);
  });

  test("produces 1 + OUTLINE_ROW_COUNT scenarios when N = 1", () => {
    const feature = generateSyntheticFeature(1);
    expect(feature.scenarios).toHaveLength(1 + OUTLINE_ROW_COUNT);
  });

  test("regular scenario names are unique across all N scenarios", () => {
    const n = 20;
    const feature = generateSyntheticFeature(n);
    const regularScenarios = feature.scenarios.slice(0, n);
    const names = regularScenarios.map((s) => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(n);
  });

  test("regular scenarios have the correct step structure (Given/When/Then)", () => {
    const feature = generateSyntheticFeature(3);
    const s = feature.scenarios[0];
    expect(s?.steps).toHaveLength(3);
    expect(s?.steps[0]?.keyword).toBe("Given");
    expect(s?.steps[1]?.keyword).toBe("When");
    expect(s?.steps[2]?.keyword).toBe("Then");
  });

  test("outline scenarios have distinct names (placeholder substitution prevents collision)", () => {
    const feature = generateSyntheticFeature(0);
    const names = feature.scenarios.map((s) => s.name);
    const unique = new Set(names);
    // All 10 rows have different placeholder values so no disambiguation suffix needed
    expect(unique.size).toBe(OUTLINE_ROW_COUNT);
    for (const name of names) {
      expect(name).not.toMatch(/\[\d+\]$/);
    }
  });

  test("outline scenarios have 3 steps each (Given/When/Then)", () => {
    const feature = generateSyntheticFeature(0);
    for (const s of feature.scenarios) {
      expect(s.steps).toHaveLength(3);
    }
  });

  test("step locations have the synthetic uri", () => {
    const feature = generateSyntheticFeature(1);
    const step = feature.scenarios[0]?.steps[0];
    expect(step?.location.uri).toBe("bench/synthetic.feature");
  });

  test("step locations have positive line numbers", () => {
    const feature = generateSyntheticFeature(1);
    for (const scenario of feature.scenarios) {
      for (const step of scenario.steps) {
        expect(step.location.line).toBeGreaterThan(0);
      }
    }
  });

  test("scenarios have no tags (bench does not use tag filtering)", () => {
    const feature = generateSyntheticFeature(3);
    for (const scenario of feature.scenarios) {
      // Regular scenarios from the bench harness carry no tags
      expect(scenario.tags).toHaveLength(0);
    }
  });

  test("feature has no feature-level tags", () => {
    const feature = generateSyntheticFeature(3);
    expect(feature.tags).toHaveLength(0);
  });

  test("large N returns the correct total scenario count", () => {
    const n = 100;
    const feature = generateSyntheticFeature(n);
    expect(feature.scenarios).toHaveLength(n + OUTLINE_ROW_COUNT);
  });

  test("scenario N-1 has step text referencing its index", () => {
    // Scenario at index i is named "Scenario i" with steps using i as counter value
    const feature = generateSyntheticFeature(5);
    const last = feature.scenarios[4];
    expect(last?.name).toBe("Scenario 4");
    // Given step references index value
    expect(last?.steps[0]?.text).toContain("4");
  });
});