import { describe, expect, test } from "bun:test";
import { parseFeature } from "@/parser/adapter";

const SIMPLE_FEATURE = `
Feature: Login
  As a user I want to log in

  Scenario: Successful login
    Given I am on the login page
    When I enter valid credentials
    Then I should be redirected to the dashboard
`;

const FEATURE_WITH_BACKGROUND = `
Feature: Shopping cart

  Background:
    Given I have an empty cart
    And I am logged in

  Scenario: Add item
    When I add an item to the cart
    Then the cart should have 1 item
`;

const FEATURE_WITH_TAGS = `
@smoke @regression
Feature: Search

  @critical
  Scenario: Basic search
    Given I am on the homepage
    When I search for "bun"
    Then I see results
`;

const FEATURE_WITH_OUTLINE = `
Feature: Calculator

  Scenario Outline: Add two numbers
    Given the numbers <a> and <b>
    When I add them
    Then the result is <result>

    Examples:
      | a | b | result |
      | 1 | 2 | 3      |
      | 5 | 5 | 10     |
`;

const FEATURE_WITH_DATATABLE = `
Feature: Data tables

  Scenario: Table step
    Given the following users:
      | name  | role  |
      | Alice | admin |
      | Bob   | user  |
`;

const FEATURE_WITH_DOCSTRING = `
Feature: Doc strings

  Scenario: Doc string step
    Given a document with:
      """
      Hello world
      """
`;

describe("parseFeature", () => {
  test("returns feature name and description", () => {
    const feature = parseFeature(SIMPLE_FEATURE, "login.feature");
    expect(feature.name).toBe("Login");
    expect(feature.description.trim()).toContain("As a user");
    expect(feature.uri).toBe("login.feature");
  });

  test("returns scenarios with steps", () => {
    const feature = parseFeature(SIMPLE_FEATURE, "login.feature");
    expect(feature.scenarios).toHaveLength(1);
    const scenario = feature.scenarios[0];
    expect(scenario?.name).toBe("Successful login");
    expect(scenario?.steps).toHaveLength(3);
  });

  test("step keywords are mapped correctly", () => {
    const feature = parseFeature(SIMPLE_FEATURE, "login.feature");
    const steps = feature.scenarios[0]?.steps ?? [];
    expect(steps[0]?.keyword).toBe("Given");
    expect(steps[1]?.keyword).toBe("When");
    expect(steps[2]?.keyword).toBe("Then");
  });

  test("step text is captured", () => {
    const feature = parseFeature(SIMPLE_FEATURE, "login.feature");
    const steps = feature.scenarios[0]?.steps ?? [];
    expect(steps[0]?.text).toBe("I am on the login page");
    expect(steps[1]?.text).toBe("I enter valid credentials");
  });

  test("step location has uri and line", () => {
    const feature = parseFeature(SIMPLE_FEATURE, "login.feature");
    const step = feature.scenarios[0]?.steps[0];
    expect(step?.location.uri).toBe("login.feature");
    expect(step?.location.line).toBeGreaterThan(0);
  });

  test("background steps are parsed", () => {
    const feature = parseFeature(FEATURE_WITH_BACKGROUND, "cart.feature");
    expect(feature.background).toBeDefined();
    expect(feature.background?.steps).toHaveLength(2);
    expect(feature.background?.steps[0]?.keyword).toBe("Given");
    expect(feature.background?.steps[1]?.keyword).toBe("And");
  });

  test("background is undefined when not present", () => {
    const feature = parseFeature(SIMPLE_FEATURE, "login.feature");
    expect(feature.background).toBeUndefined();
  });

  test("feature tags are parsed", () => {
    const feature = parseFeature(FEATURE_WITH_TAGS, "search.feature");
    expect(feature.tags).toHaveLength(2);
    const tagNames = feature.tags.map((t) => t.name);
    expect(tagNames).toContain("@smoke");
    expect(tagNames).toContain("@regression");
  });

  test("scenario tags are parsed", () => {
    const feature = parseFeature(FEATURE_WITH_TAGS, "search.feature");
    const scenario = feature.scenarios[0];
    expect(scenario?.tags).toHaveLength(1);
    expect(scenario?.tags[0]?.name).toBe("@critical");
  });

  test("scenario outline expands to multiple scenarios", () => {
    const feature = parseFeature(FEATURE_WITH_OUTLINE, "calc.feature");
    expect(feature.scenarios).toHaveLength(2);
  });

  test("expanded outline scenario names include example values", () => {
    const feature = parseFeature(FEATURE_WITH_OUTLINE, "calc.feature");
    const names = feature.scenarios.map((s) => s.name);
    expect(names[0]).toContain("Add two numbers");
    expect(names[1]).toContain("Add two numbers");
  });

  test("expanded outline steps have substituted text", () => {
    const feature = parseFeature(FEATURE_WITH_OUTLINE, "calc.feature");
    const firstScenario = feature.scenarios[0];
    const givenStep = firstScenario?.steps[0];
    expect(givenStep?.text).toContain("1");
    expect(givenStep?.text).toContain("2");
  });

  test("data table is parsed on step", () => {
    const feature = parseFeature(FEATURE_WITH_DATATABLE, "dt.feature");
    const step = feature.scenarios[0]?.steps[0];
    expect(step?.dataTable).toBeDefined();
    const objects = step?.dataTable?.asObjects() ?? [];
    expect(objects).toHaveLength(2);
    expect(objects[0]).toEqual({ name: "Alice", role: "admin" });
    expect(objects[1]).toEqual({ name: "Bob", role: "user" });
  });

  test("docstring is parsed on step", () => {
    const feature = parseFeature(FEATURE_WITH_DOCSTRING, "doc.feature");
    const step = feature.scenarios[0]?.steps[0];
    expect(step?.docString).toContain("Hello world");
  });

  test("returns empty feature for source with no Feature block", () => {
    const feature = parseFeature("", "empty.feature");
    expect(feature.name).toBe("");
    expect(feature.scenarios).toHaveLength(0);
    expect(feature.background).toBeUndefined();
  });
});
