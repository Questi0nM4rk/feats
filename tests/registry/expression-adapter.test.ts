import { beforeEach, describe, expect, test } from "bun:test";
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

describe("matchStep", () => {
  test("matches a plain text step", () => {
    const defs: StepDefinition[] = [def("I am on the homepage")];
    const result = matchStep(defs, "I am on the homepage");
    expect(result.definition.pattern).toBe("I am on the homepage");
    expect(result.args).toHaveLength(0);
  });

  test("matches a step with {string} parameter and extracts value", () => {
    const defs: StepDefinition[] = [def("I enter {string} as username")];
    const result = matchStep(defs, 'I enter "alice" as username');
    expect(result.definition.pattern).toBe("I enter {string} as username");
    expect(result.args).toHaveLength(1);
    expect(result.args[0]).toBe("alice");
  });

  test("matches a step with {int} parameter and converts to number", () => {
    const defs: StepDefinition[] = [def("there are {int} items")];
    const result = matchStep(defs, "there are 42 items");
    expect(result.args[0]).toBe(42);
  });

  test("matches a step with multiple parameters", () => {
    const defs: StepDefinition[] = [def("I add {int} and {int}")];
    const result = matchStep(defs, "I add 3 and 4");
    expect(result.args).toEqual([3, 4]);
  });

  test("throws on undefined step (no match)", () => {
    const defs: StepDefinition[] = [def("a known step")];
    expect(() => matchStep(defs, "an unknown step")).toThrow(/Undefined step/);
  });

  test("throws on ambiguous step (multiple matches)", () => {
    const defs: StepDefinition[] = [def("a {string} value"), def("a {string} value")];
    expect(() => matchStep(defs, 'a "hello" value')).toThrow(/Ambiguous step/);
  });

  test("error message includes step text on undefined step", () => {
    expect(() => matchStep([], "some unmapped step")).toThrow('"some unmapped step"');
  });

  test("returns the matched definition object", () => {
    const definition = def("exact match");
    const result = matchStep([definition], "exact match");
    expect(result.definition).toBe(definition);
  });
});
