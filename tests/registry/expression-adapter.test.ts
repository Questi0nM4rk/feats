import { beforeEach, describe, expect, test } from "bun:test";
import type { ParsedStep } from "@/parser/models";
import { matchStep } from "@/registry/expression-adapter";
import { clearParameterTypeRegistry } from "@/registry/parameter-types";
import type { StepDefinition } from "@/registry/step-definition";

beforeEach(() => {
  clearParameterTypeRegistry();
});

const def = (pattern: string): StepDefinition => ({
  keyword: "Given",
  pattern,
  callback: async () => {},
});

const step = (text: string, line = 1, uri = "tests/sample.feature"): ParsedStep => ({
  keyword: "Given",
  text,
  dataTable: undefined,
  docString: undefined,
  location: { uri, line },
});

describe("matchStep", () => {
  test("matches a plain text step", () => {
    const defs: StepDefinition[] = [def("I am on the homepage")];
    const result = matchStep(defs, step("I am on the homepage"));
    expect(result.definition.pattern).toBe("I am on the homepage");
    expect(result.args).toHaveLength(0);
  });

  test("matches a step with {string} parameter and extracts value", () => {
    const defs: StepDefinition[] = [def("I enter {string} as username")];
    const result = matchStep(defs, step('I enter "alice" as username'));
    expect(result.definition.pattern).toBe("I enter {string} as username");
    expect(result.args).toHaveLength(1);
    expect(result.args[0]).toBe("alice");
  });

  test("matches a step with {int} parameter and converts to number", () => {
    const defs: StepDefinition[] = [def("there are {int} items")];
    const result = matchStep(defs, step("there are 42 items"));
    expect(result.args[0]).toBe(42);
  });

  test("matches a step with multiple parameters", () => {
    const defs: StepDefinition[] = [def("I add {int} and {int}")];
    const result = matchStep(defs, step("I add 3 and 4"));
    expect(result.args).toEqual([3, 4]);
  });

  test("throws on undefined step (no match)", () => {
    const defs: StepDefinition[] = [def("a known step")];
    expect(() => matchStep(defs, step("an unknown step"))).toThrow(/Undefined step/);
  });

  test("throws on ambiguous step (multiple matches)", () => {
    const defs: StepDefinition[] = [def("a {string} value"), def("a {string} value")];
    expect(() => matchStep(defs, step('a "hello" value'))).toThrow(/Ambiguous step/);
  });

  test("error message includes step text on undefined step", () => {
    expect(() => matchStep([], step("some unmapped step"))).toThrow('"some unmapped step"');
  });

  test("returns the matched definition object", () => {
    const definition = def("exact match");
    const result = matchStep([definition], step("exact match"));
    expect(result.definition).toBe(definition);
  });

  test("undefined step error includes uri:line location", () => {
    expect(() => matchStep([], step("a step", 17, "tests/foo.feature"))).toThrow(
      "tests/foo.feature:17",
    );
  });

  test("undefined step error embeds a copy-paste snippet with placeholder substitution", () => {
    // The `step()` helper defaults keyword to "Given", so the snippet starts
    // with `Given(`. The point of this test is that the literal `"init"` got
    // substituted with `{string}` — not just embedded raw.
    expect(() => matchStep([], step('I run "init"'))).toThrow('Given("I run {string}",');
  });

  test("ambiguous step error includes uri:line location", () => {
    const defs: StepDefinition[] = [def("a {string} value"), def("a {string} value")];
    expect(() => matchStep(defs, step('a "hello" value', 8, "tests/dup.feature"))).toThrow(
      "tests/dup.feature:8",
    );
  });
});
