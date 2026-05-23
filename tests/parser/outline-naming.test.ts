// outline-naming.test.ts
//
// Regression tests for §0.2 — Scenario Outline name collision.
//
// Cucumber's compile() substitutes <placeholders> in the scenario name. If
// the outline's name has no placeholder, every compiled example ends up
// with the same name; bun:test then renders identical test names. The fix
// appends [N] suffixes only when names collide.

import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";

describe("Scenario Outline name disambiguation (§0.2)", () => {
  test("outline without placeholder in name → all examples get [N] suffix", () => {
    const feature = parseFeature(
      `
Feature: F
  Scenario Outline: Add item to cart
    Given the cart has <count> items

    Examples:
      | count |
      | 1     |
      | 2     |
      | 3     |
`,
      "f.feature",
    );

    const names = feature.scenarios.map((s) => s.name);
    expect(names).toEqual(["Add item to cart [1]", "Add item to cart [2]", "Add item to cart [3]"]);
  });

  test("outline WITH placeholder in name → kept distinct, no suffix added", () => {
    const feature = parseFeature(
      `
Feature: F
  Scenario Outline: Add <count> items
    Given the cart has <count> items

    Examples:
      | count |
      | 1     |
      | 2     |
      | 3     |
`,
      "f.feature",
    );

    const names = feature.scenarios.map((s) => s.name);
    expect(names).toEqual(["Add 1 items", "Add 2 items", "Add 3 items"]);
    // No spurious [N] suffix
    for (const name of names) {
      expect(name).not.toMatch(/\[\d+\]$/);
    }
  });

  test("single-row outline → no suffix added", () => {
    const feature = parseFeature(
      `
Feature: F
  Scenario Outline: Lone example
    Given an item costing <price>

    Examples:
      | price |
      | 9.99  |
`,
      "f.feature",
    );

    expect(feature.scenarios).toHaveLength(1);
    const first = feature.scenarios[0];
    expect(first?.name).toBe("Lone example");
  });

  test("non-outline scenarios sharing a name across features are untouched", () => {
    // The fix only de-dupes within a single Scenario Outline's expanded set.
    // Plain scenarios with the same name across features are left alone
    // (that's a user issue, not a runner issue).
    const feature = parseFeature(
      `
Feature: F
  Scenario: Common name
    Given step A

  Scenario: Common name
    Given step B
`,
      "f.feature",
    );

    const names = feature.scenarios.map((s) => s.name);
    expect(names).toEqual(["Common name", "Common name"]);
  });

  test("partial collision: some examples share name via placeholder, others don't", () => {
    // <kind> in the name disambiguates rows with different kinds, but two
    // rows have kind=widget and collide. Those two should get suffixes;
    // the third (gadget) stays clean.
    const feature = parseFeature(
      `
Feature: F
  Scenario Outline: Sell a <kind>
    Given a <kind> in stock

    Examples:
      | kind   |
      | widget |
      | widget |
      | gadget |
`,
      "f.feature",
    );

    const names = feature.scenarios.map((s) => s.name);
    expect(names).toEqual(["Sell a widget [1]", "Sell a widget [2]", "Sell a gadget"]);
  });
});
