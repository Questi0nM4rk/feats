// tests/parser/rule.test.ts
//
// `Rule:` keyword support. Scenarios under a Rule appear flat in
// `feature.scenarios` (for backwards compat) but carry a `rule` metadata
// field. The runner composes feature ◁ rule ◁ scenario tags for filtering.

import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";
import { clearRegistry, Given } from "@/registry/step-registry";
import { runFeatures } from "@/runner/feature-runner";
import { clearHooks } from "@/runner/hook-runner";

describe("parser — Rule:", () => {
  test("scenarios under a Rule appear flat in feature.scenarios", () => {
    const feature = parseFeature(
      `
Feature: F
  Rule: Empty carts cost nothing
    Scenario: Empty cart total is zero
      Given a step
  Rule: Items add up
    Scenario: One item
      Given a step
    Scenario: Two items
      Given a step
`,
      "rules.feature",
    );

    expect(feature.scenarios).toHaveLength(3);
    expect(feature.scenarios.map((s) => s.name)).toEqual([
      "Empty cart total is zero",
      "One item",
      "Two items",
    ]);
  });

  test("each scenario carries its rule metadata", () => {
    const feature = parseFeature(
      `
Feature: F
  Rule: First rule
    Scenario: A
      Given a step
  Rule: Second rule
    Scenario: B
      Given a step
`,
      "rules-meta.feature",
    );

    expect(feature.scenarios[0]?.rule?.name).toBe("First rule");
    expect(feature.scenarios[1]?.rule?.name).toBe("Second rule");
  });

  test("rule-less scenarios have no rule field", () => {
    const feature = parseFeature(
      `
Feature: F
  Scenario: bare
    Given a step
`,
      "no-rule.feature",
    );

    expect(feature.scenarios[0]?.rule).toBeUndefined();
  });

  test("mix of rule-bound and bare scenarios — bare comes first if declared first", () => {
    const feature = parseFeature(
      `
Feature: F
  Scenario: bare
    Given a step
  Rule: R
    Scenario: under R
      Given a step
`,
      "mixed.feature",
    );

    expect(feature.scenarios).toHaveLength(2);
    expect(feature.scenarios[0]?.name).toBe("bare");
    expect(feature.scenarios[0]?.rule).toBeUndefined();
    expect(feature.scenarios[1]?.name).toBe("under R");
    expect(feature.scenarios[1]?.rule?.name).toBe("R");
  });

  test("rule tags are surfaced on rule.tags", () => {
    const feature = parseFeature(
      `
Feature: F
  @critical
  Rule: My rule
    Scenario: s
      Given a step
`,
      "rule-tags.feature",
    );

    expect(feature.scenarios[0]?.rule?.tags.map((t) => t.name)).toEqual(["@critical"]);
  });
});

// ---- end-to-end: rule tags participate in tag filtering ----
{
  clearRegistry();
  clearHooks();

  const ran: string[] = [];
  Given("a step", () => {
    ran.push("step");
  });

  const feature = parseFeature(
    `
Feature: F
  Rule: Critical path
    @critical
    Scenario: A
      Given a step
  Rule: Background polish
    @nice-to-have
    Scenario: B
      Given a step
`,
    "rule-filter.feature",
  );

  runFeatures([feature], { tagFilter: "@critical" });

  describe("Rule + tag filter — only matching scenarios run", () => {
    test("only the @critical scenario runs (1 step recorded)", () => {
      expect(ran).toEqual(["step"]);
    });
  });
}

// ---- end-to-end: tag inheritance from Rule → Scenario ----
{
  clearRegistry();
  clearHooks();

  const ran: string[] = [];
  Given("a step", () => {
    ran.push("step");
  });

  // Tag on the Rule applies to all its scenarios. Filter on the rule tag
  // alone should match the scenario even without scenario-level tags.
  //
  // NOTE on Gherkin layout: once a `Rule:` block opens, EVERY subsequent
  // scenario at the same indentation belongs to that rule (until another
  // Rule starts). Bare scenarios must therefore come BEFORE any Rule.
  const feature = parseFeature(
    `
Feature: F
  Scenario: bare with no tag
    Given a step
  @rule-level
  Rule: R
    Scenario: under R with no own tags
      Given a step
`,
    "rule-inherit.feature",
  );

  runFeatures([feature], { tagFilter: "@rule-level" });

  describe("Rule tag inheritance — scenarios under a tagged Rule inherit it for filtering", () => {
    test("only the rule's scenario runs (bare scenario filtered out)", () => {
      expect(ran).toEqual(["step"]);
    });
  });
}
