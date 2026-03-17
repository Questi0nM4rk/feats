import { beforeEach, describe, expect, test } from "bun:test";
import { matchStep } from "@/registry/expression-adapter";
import {
  clearParameterTypeRegistry,
  defineParameterType,
  getParameterTypeRegistry,
} from "@/registry/parameter-types";
import type { StepDefinition } from "@/registry/step-definition";

beforeEach(() => {
  clearParameterTypeRegistry();
});

describe("defineParameterType", () => {
  test("registers a custom parameter type in the registry", () => {
    defineParameterType({
      name: "color",
      regexp: /red|green|blue/,
      transformer: (v) => v.toUpperCase(),
    });
    const registry = getParameterTypeRegistry();
    const found = registry.lookupByTypeName("color");
    expect(found).toBeDefined();
  });

  test("registered type can be used in step matching", () => {
    defineParameterType({
      name: "color",
      regexp: /red|green|blue/,
      transformer: (v) => v.toUpperCase(),
    });

    const defs: StepDefinition[] = [
      {
        keyword: "Given",
        pattern: "the background is {color}",
        callback: async () => {},
      },
    ];

    const result = matchStep(defs, "the background is red");
    expect(result.args[0]).toBe("RED");
  });

  test("transformer return value is used as the arg", () => {
    defineParameterType({
      name: "doubled",
      regexp: /\d+/,
      transformer: (v) => Number(v) * 2,
    });

    const defs: StepDefinition[] = [
      {
        keyword: "Given",
        pattern: "multiplied value is {doubled}",
        callback: async () => {},
      },
    ];

    const result = matchStep(defs, "multiplied value is 5");
    expect(result.args[0]).toBe(10);
  });

  test("clearParameterTypeRegistry removes custom types", () => {
    defineParameterType({
      name: "color",
      regexp: /red|green|blue/,
      transformer: (v) => v,
    });

    clearParameterTypeRegistry();

    const registry = getParameterTypeRegistry();
    expect(registry.lookupByTypeName("color")).toBeUndefined();
  });

  test("multiple custom types can be registered", () => {
    defineParameterType({
      name: "direction",
      regexp: /north|south|east|west/,
      transformer: (v) => v,
    });
    defineParameterType({
      name: "size",
      regexp: /small|medium|large/,
      transformer: (v) => v,
    });

    const registry = getParameterTypeRegistry();
    expect(registry.lookupByTypeName("direction")).toBeDefined();
    expect(registry.lookupByTypeName("size")).toBeDefined();
  });
});
